#!/usr/bin/env node

/**
 * CSV Splitter Utility
 * 
 * This script helps split large CSV files into smaller chunks for upload.
 * Usage: node csv-splitter.js input.csv [maxRows]
 * 
 * Example: node csv-splitter.js large-inventory.csv 1000
 */

const fs = require('fs');
const path = require('path');

function splitCSV(inputFile, maxRows = 1000) {
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File '${inputFile}' not found.`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf8');
  const lines = content.split('\n');
  const header = lines[0];
  const dataLines = lines.slice(1);
  
  const totalRows = dataLines.length;
  const chunks = Math.ceil(totalRows / maxRows);
  
  console.log(`Splitting ${inputFile} into ${chunks} files...`);
  console.log(`Total rows: ${totalRows}, Max rows per file: ${maxRows}`);
  
  const baseName = path.basename(inputFile, '.csv');
  const outputDir = path.dirname(inputFile);
  
  for (let i = 0; i < chunks; i++) {
    const start = i * maxRows;
    const end = Math.min(start + maxRows, totalRows);
    const chunkData = dataLines.slice(start, end);
    
    const outputFile = path.join(outputDir, `${baseName}_part_${i + 1}.csv`);
    const outputContent = [header, ...chunkData].join('\n');
    
    fs.writeFileSync(outputFile, outputContent);
    console.log(`Created: ${outputFile} (${chunkData.length} rows)`);
  }
  
  console.log(`\nSplit complete! Created ${chunks} files.`);
  console.log('You can now upload these smaller files one by one.');
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('CSV Splitter Utility');
  console.log('Usage: node csv-splitter.js <input-file> [max-rows]');
  console.log('');
  console.log('Examples:');
  console.log('  node csv-splitter.js inventory.csv');
  console.log('  node csv-splitter.js inventory.csv 500');
  process.exit(0);
}

const inputFile = args[0];
const maxRows = parseInt(args[1]) || 1000;

splitCSV(inputFile, maxRows);
