import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getPOSAccounts, getUserStores, createPOSAccount, updatePOSAccount, deletePOSAccount, linkStoreToPOSAccount, scrapePOS } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Plus, RefreshCw, Trash2, Link as LinkIcon, Settings as SettingsIcon } from 'lucide-react';

const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState('pos-accounts');

    return (
        <div className="container mx-auto px-4 py-6 max-w-7xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-1">Manage your account and integrations</p>
            </div>

            {/* Tabs */}
            <div className="border-b mb-6">
                <nav className="flex gap-4">
                    <button
                        onClick={() => setActiveTab('pos-accounts')}
                        className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'pos-accounts'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        POS Accounts
                    </button>
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'general'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        General
                    </button>
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'pos-accounts' && <POSAccountsTab />}
            {activeTab === 'general' && <GeneralTab />}
        </div>
    );
};

const POSAccountsTab = () => {
    const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useQuery(getPOSAccounts);
    const { data: stores, isLoading: storesLoading } = useQuery(getUserStores);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState(null);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [syncing, setSyncing] = useState(null);

    const handleSync = async (accountId) => {
        try {
            setSyncing(accountId);
            await scrapePOS({ posAccountId: accountId, storeIds: [] });
            alert('Sync completed! Check your inventory.');
        } catch (err) {
            alert('Sync failed: ' + err.message);
        } finally {
            setSyncing(null);
        }
    };

    const handleDelete = async (accountId) => {
        if (!confirm('Are you sure you want to delete this POS account?')) return;
        try {
            await deletePOSAccount({ id: accountId });
            refetchAccounts();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    if (accountsLoading || storesLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-semibold">POS Account Integrations</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Connect your POS systems to automatically sync inventory
                    </p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add POS Account
                </Button>
            </div>

            {accounts && accounts.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <SettingsIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">No POS Accounts</h3>
                    <p className="text-muted-foreground mb-6">Create your first POS account to start syncing inventory</p>
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add POS Account
                    </Button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {accounts?.map(account => (
                        <div key={account.id} className="border rounded-lg p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-semibold">{account.name}</h3>
                                    <p className="text-sm text-muted-foreground">{account.posType}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setAccountToEdit(account);
                                            setShowEditModal(true);
                                        }}
                                    >
                                        <SettingsIcon className="h-4 w-4 mr-1" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSelectedAccount(account);
                                            setShowLinkModal(true);
                                        }}
                                    >
                                        <LinkIcon className="h-4 w-4 mr-1" />
                                        Link Stores
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={syncing === account.id || account.stores.length === 0}
                                        onClick={() => handleSync(account.id)}
                                    >
                                        <RefreshCw className={`h-4 w-4 mr-1 ${syncing === account.id ? 'animate-spin' : ''}`} />
                                        {syncing === account.id ? 'Syncing...' : 'Sync All Stores'}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDelete(account.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <h4 className="text-sm font-medium mb-2">Linked Stores ({account.stores.length})</h4>
                                {account.stores.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No stores linked yet</p>
                                ) : (
                                    <div className="grid gap-2">
                                        {account.stores.map(store => (
                                            <div key={store.id} className="flex items-center justify-between p-2 bg-muted rounded">
                                                <div>
                                                    <span className="font-medium">{store.friendlyName || store.name}</span>
                                                    <span className="text-sm text-muted-foreground ml-2">
                                                        {store.location}
                                                    </span>
                                                </div>
                                                <span className="text-xs bg-background px-2 py-1 rounded">
                                                    ID: {store.externalStoreId || 'Not set'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCreateModal && (
                <CreateAccountModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        refetchAccounts();
                        setShowCreateModal(false);
                    }}
                />
            )}

            {showEditModal && accountToEdit && (
                <EditAccountModal
                    account={accountToEdit}
                    onClose={() => {
                        setShowEditModal(false);
                        setAccountToEdit(null);
                    }}
                    onSuccess={() => {
                        refetchAccounts();
                        setShowEditModal(false);
                        setAccountToEdit(null);
                    }}
                />
            )}

            {showLinkModal && selectedAccount && (
                <LinkStoreModal
                    account={selectedAccount}
                    stores={stores}
                    onClose={() => {
                        setShowLinkModal(false);
                        setSelectedAccount(null);
                    }}
                    onSuccess={() => {
                        refetchAccounts();
                        setShowLinkModal(false);
                        setSelectedAccount(null);
                    }}
                />
            )}
        </div>
    );
};

const GeneralTab = () => {
    return (
        <div>
            <h2 className="text-xl font-semibold mb-4">General Settings</h2>
            <p className="text-muted-foreground">General settings will be added here.</p>
        </div>
    );
};

const CreateAccountModal = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        posType: 'GREENLINE',
        username: '',
        password: '',
        loginUrl: 'https://app.getgreenline.co/loginV2'
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await createPOSAccount(formData);
            onSuccess();
        } catch (err) {
            alert('Failed to create account: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Create POS Account</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Account Name</label>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Main Greenline Account"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">POS Type</label>
                        <select
                            className="w-full border rounded px-3 py-2"
                            value={formData.posType}
                            onChange={(e) => setFormData({ ...formData, posType: e.target.value })}
                        >
                            <option value="GREENLINE">Greenline</option>
                            <option value="DUTCHIE">Dutchie</option>
                            <option value="COVA">Cova</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Username/Email</label>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Password</label>
                        <input
                            type="password"
                            className="w-full border rounded px-3 py-2"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Login URL (optional)</label>
                        <input
                            type="url"
                            className="w-full border rounded px-3 py-2"
                            value={formData.loginUrl}
                            onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Creating...' : 'Create Account'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditAccountModal = ({ account, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: account.name,
        posType: account.posType,
        username: '', // Don't populate with encrypted value
        password: '', // Don't populate with encrypted value
        loginUrl: account.loginUrl || 'https://app.getgreenline.co/loginV2'
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Only send fields that have values
            const updates = {
                id: account.id,
                name: formData.name,
                posType: formData.posType,
                loginUrl: formData.loginUrl
            };

            if (formData.username) updates.username = formData.username;
            if (formData.password) updates.password = formData.password;

            await updatePOSAccount(updates);
            onSuccess();
        } catch (err) {
            alert('Failed to update account: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Edit POS Account</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Account Name</label>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">POS Type</label>
                        <select
                            className="w-full border rounded px-3 py-2"
                            value={formData.posType}
                            onChange={(e) => setFormData({ ...formData, posType: e.target.value })}
                        >
                            <option value="GREENLINE">Greenline</option>
                            <option value="DUTCHIE">Dutchie</option>
                            <option value="COVA">Cova</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">New Username/Email (leave blank to keep current)</label>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            placeholder="Enter new username to update"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">New Password (leave blank to keep current)</label>
                        <input
                            type="password"
                            className="w-full border rounded px-3 py-2"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="Enter new password to update"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Login URL</label>
                        <input
                            type="url"
                            className="w-full border rounded px-3 py-2"
                            value={formData.loginUrl}
                            onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
                        />
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Updating...' : 'Update Account'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const LinkStoreModal = ({ account, stores, onClose, onSuccess }) => {
    const [selectedStore, setSelectedStore] = useState('');
    const [externalStoreId, setExternalStoreId] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const availableStores = stores?.filter(s => !account.stores.find(as => as.id === s.id)) || [];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await linkStoreToPOSAccount({
                storeId: parseInt(selectedStore),
                posAccountId: account.id,
                externalStoreId
            });
            onSuccess();
        } catch (err) {
            alert('Failed to link store: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg max-w-md w-full">
                <h2 className="text-2xl font-bold mb-4">Link Store to {account.name}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Select Store</label>
                        <select
                            className="w-full border rounded px-3 py-2"
                            value={selectedStore}
                            onChange={(e) => setSelectedStore(e.target.value)}
                            required
                        >
                            <option value="">-- Select a store --</option>
                            {availableStores.map(store => (
                                <option key={store.id} value={store.id}>
                                    {store.friendlyName || store.name} - {store.location}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            External Store ID (Greenline Location ID)
                        </label>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2"
                            value={externalStoreId}
                            onChange={(e) => setExternalStoreId(e.target.value)}
                            placeholder="e.g., 917, 1256, 1257"
                            required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            This is the location ID from Greenline (e.g., 917 for South Albert Regina)
                        </p>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Linking...' : 'Link Store'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsPage;
