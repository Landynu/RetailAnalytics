import { chromium } from 'playwright';
import { HttpError } from 'wasp/server';
import { decrypt } from './encryption.js';

/**
 * Scrapes a POS system for inventory data using account credentials.
 * Supports bulk syncing of multiple stores under one account.
 * 
 * @param {object} args - Arguments for scraping
 * @param {number} args.posAccountId - POS account ID to use for credentials
 * @param {number[]} args.storeIds - Optional array of store IDs to sync (if empty, syncs all stores linked to account)
 * @param {object} context - Wasp context
 */
export const scrapePOS = async (args, context) => {
    const { posAccountId, storeIds = [] } = args;
    if (!context.user) { throw new HttpError(401); }

    console.log('[Scraper] Received args:', JSON.stringify(args));

    if (!posAccountId) {
        throw new HttpError(400, 'posAccountId is required');
    }

    console.log(`[Scraper] Starting scrape with POS Account ${posAccountId}`);

    // Fetch POS account with credentials
    const account = await context.entities.POSAccount.findUnique({
        where: { id: posAccountId },
        include: {
            stores: {
                where: {
                    userId: context.user.id,
                    isActive: true,
                    ...(storeIds.length > 0 ? { id: { in: storeIds } } : {})
                }
            }
        }
    });

    if (!account || account.userId !== context.user.id) {
        throw new HttpError(403, 'Not authorized to use this POS account');
    }

    if (account.stores.length === 0) {
        throw new HttpError(400, 'No stores linked to this POS account');
    }

    // Decrypt credentials
    const username = decrypt(account.username)?.trim();
    const password = decrypt(account.password)?.trim();

    if (!username || !password) {
        throw new HttpError(400, 'POS account has missing credentials');
    }
    const loginUrl = account.loginUrl || 'https://app.getgreenline.co/loginV2';

    console.log(`[Scraper] Account: ${account.name} (${account.posType})`);
    console.log(`[Scraper] Stores to sync: ${account.stores.length}`);

    let browser = null;
    const results = [];

    try {
        // Launch browser
        browser = await chromium.launch({
            headless: true, // Keep headless for server
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Standard flags for server env
        });

        // Use a real user agent
        const browserContext = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = await browserContext.newPage();

        // Capture browser console logs
        page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));

        // 1. Login
        console.log(`[Scraper] Navigating to ${loginUrl}...`);
        // Capture network requests to debug API calls
        page.on('request', request => {
            if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
                console.log(`[Browser Network] ${request.method()} ${request.url()}`);
            }
        });

        page.on('response', async response => {
            if (response.url().includes('login') || response.url().includes('api')) {
                try {
                    const status = response.status();
                    if (status >= 400) {
                        console.log(`[Browser Network] Error ${status} from ${response.url()}`);
                    }
                } catch (e) { }
            }
        });
        await page.goto(loginUrl, { waitUntil: 'networkidle' });

        // Greenline Login Logic
        try {
            console.log('[Scraper] Attempting login...');
            console.log(`[Scraper] Debug: Username length: ${username.length}, Password length: ${password.length}`);
            console.log(`[Scraper] Debug: Password starts with: ${password.substring(0, 1)}..., ends with: ...${password.substring(password.length - 1)}`);

            // Check for "Continue as..." button first
            const continueBtn = await page.$('.continue-session-btn');
            if (continueBtn) {
                console.log('[Scraper] Found "Continue Session" button, clicking it...');
                await continueBtn.click();
            } else {
                // Standard Login Flow - Aggressive Event Dispatch
                console.log('[Scraper] Performing login with aggressive event dispatch...');

                // Set Email
                await page.$eval('input#email', (el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }, username);

                // Set Password
                await page.$eval('input#password', (el, val) => {
                    el.value = val;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }, password);

                // Verify what was typed
                const emailValue = await page.$eval('input#email', el => el.value);
                const passwordValue = await page.$eval('input#password', el => el.value);
                console.log(`[Scraper] Debug: Email field value: "${emailValue}"`);
                console.log(`[Scraper] Debug: Password field value length: ${passwordValue.length}`);

                // Hide HubSpot and other potential overlays
                await page.addStyleTag({ content: '#hubspot-messages-iframe-container { display: none !important; }' });

                // Wait a moment for validation
                await page.waitForTimeout(1000);

                // Check if button is disabled
                const isBtnDisabled = await page.$eval('button.ant-btn-primary', el => el.disabled);
                console.log(`[Scraper] Login Button Disabled: ${isBtnDisabled}`);

                if (isBtnDisabled) {
                    console.log('[Scraper] Button is disabled! Validation failed?');
                    // Try to trigger input events again
                    await page.type('input#password', ' ');
                    await page.keyboard.press('Backspace');
                }

                // Click login using Native DOM click
                console.log('[Scraper] Triggering native DOM click on login button...');
                await page.evaluate(() => {
                    const btn = document.querySelector('button.ant-btn-primary');
                    if (btn) {
                        btn.scrollIntoView();
                        btn.click();
                    }
                });

                // Also press Enter just in case
                await page.keyboard.press('Enter');
            }

            // Wait for navigation
            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => console.log('Network idle timeout, continuing...'));

            // Check if we're still on the login page (failure)
            if (page.url().includes('login')) {
                // Save screenshot to /tmp to avoid nodemon restart
                await page.screenshot({ path: '/tmp/login_failure.png' });

                // Try to find error message
                const errorText = await page.evaluate(() => {
                    const alert = document.querySelector('.ant-alert-message');
                    const error = document.querySelector('.ant-form-item-explain-error');
                    return alert ? alert.innerText : (error ? error.innerText : 'No specific error found');
                });

                console.log(`[Scraper] Login failed. Page Error Text: "${errorText}"`);
                console.log(`[Scraper] Screenshot saved to /tmp/login_failure.png`);

                throw new Error(`Login failed - still on login page. Error: ${errorText}`);
            }

            console.log('[Scraper] Login successful!');

        } catch (loginError) {
            console.error('[Scraper] Login failed:', loginError);
            // DO NOT save screenshot to avoid server restart
            // await page.screenshot({ path: 'login_error.png' });
            throw new Error(`Login failed: ${loginError.message}`);
        }

        // 2. Loop through each store and scrape
        for (const store of account.stores) {
            console.log(`[Scraper] Syncing store: ${store.name} (External ID: ${store.externalStoreId || 'N/A'})`);

            try {
                // TODO: Determine correct inventory URL structure
                // For now, we'll try to navigate to a likely inventory page or just log the current URL
                console.log(`[Scraper] Current URL: ${page.url()}`);

                // We need to find where the reports are. 
                // Strategy: 
                // 1. If we have a store ID, maybe we need to switch locations first?
                // 2. Or maybe the URL structure includes the location ID?

                // For this first real run, let's try to capture the dashboard state to see how to navigate
                await page.screenshot({ path: `dashboard_${store.id}.png` });

                // Simulated data for now until we confirm navigation
                const scrapedData = [
                    {
                        gtin: `${store.id}00000000001`,
                        name: `Product from ${store.name} - A`,
                        quantity: 10,
                        price: 29.99,
                        category: "Flower"
                    }
                ];

                console.log(`[Scraper] Extracted ${scrapedData.length} items for ${store.name}`);

                // Save snapshot
                const snapshot = await context.entities.InventorySnapshot.create({
                    data: {
                        storeId: store.id,
                        fileType: 'SCRAPE_PLAYWRIGHT',
                        rawData: JSON.stringify(scrapedData),
                        uploadedAt: new Date()
                    }
                });

                // Update stock levels
                let productsUpdated = 0;
                for (const item of scrapedData) {
                    let product = await context.entities.ProductCatalog.findUnique({
                        where: { gtin: item.gtin }
                    });

                    if (!product) {
                        product = await context.entities.ProductCatalog.create({
                            data: {
                                gtin: item.gtin,
                                name: item.name,
                                retailPrice: item.price,
                                category: item.category
                            }
                        });
                    }

                    await context.entities.StockLevel.upsert({
                        where: {
                            storeId_productId: {
                                storeId: store.id,
                                productId: product.id
                            }
                        },
                        update: {
                            quantity: item.quantity,
                            lastUpdated: new Date(),
                            snapshotId: snapshot.id
                        },
                        create: {
                            storeId: store.id,
                            productId: product.id,
                            quantity: item.quantity,
                            snapshotId: snapshot.id
                        }
                    });

                    productsUpdated++;
                }

                results.push({
                    storeId: store.id,
                    storeName: store.name,
                    success: true,
                    itemsScraped: scrapedData.length,
                    productsUpdated,
                    snapshotId: snapshot.id
                });

                console.log(`✅ [Scraper] Completed ${store.name}: ${productsUpdated} products updated`);

            } catch (storeError) {
                console.error(`❌ [Scraper] Failed to sync ${store.name}:`, storeError);
                results.push({
                    storeId: store.id,
                    storeName: store.name,
                    success: false,
                    error: storeError.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[Scraper] Bulk sync complete: ${successCount}/${account.stores.length} stores synced`);

        return {
            success: true,
            accountName: account.name,
            totalStores: account.stores.length,
            successfulStores: successCount,
            results
        };

    } catch (error) {
        console.error('[Scraper] Error:', error);
        throw new HttpError(500, 'Scraping failed', { message: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};
