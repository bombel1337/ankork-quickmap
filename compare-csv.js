const fs = require('fs');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

// Define file paths
const nsaDecisionsPath = 'nsa_decisions_all.csv';
const resultsCheckPath = 'results.csv';
const missingOutputPath = 'missing.csv';

async function processFiles() {
    try {
        console.log('Reading NSA decisions file...');
    
        // First, read all links from nsa_decisions_all.csv into a Set for efficient lookup
        const nsaLinks = new Set();
    
        // Create a readable stream for the nsa_decisions_all.csv file
        const nsaParser = fs
            .createReadStream(nsaDecisionsPath)
            .pipe(parse({
                delimiter: ',',
                columns: true,
                skip_empty_lines: true
            }));
    
        // Process each record to extract links
        for await (const record of nsaParser) {
            nsaLinks.add(record.link);
        }
    
        console.log(`Loaded ${nsaLinks.size} links from NSA decisions file`);
    
        // Now read results_check.csv and check each link against the Set
        const missingRecords = [];
    
        // Create a readable stream for the results_check.csv file
        const resultsParser = fs
            .createReadStream(resultsCheckPath)
            .pipe(parse({
                delimiter: ',',
                columns: true,
                skip_empty_lines: true
            }));
    
        console.log('Checking results file against NSA decisions...');
    
        // Process each record and check if link exists in nsaLinks
        for await (const record of resultsParser) {
            if (!nsaLinks.has(record.link)) {
                missingRecords.push(record);
            }
        }
    
        console.log(`Found ${missingRecords.length} missing records`);
    
        // Write missing records to missing.csv
        const writableStream = fs.createWriteStream(missingOutputPath);
    
        const stringifier = stringify({
            header: true,
            columns: ['link', 'title', 'date', 'date span', 'page', 'number']
        });
    
        stringifier.pipe(writableStream);
    
        for (const record of missingRecords) {
            stringifier.write(record);
        }
    
        stringifier.end();
    
        console.log(`Successfully wrote missing records to ${missingOutputPath}`);
    
    } catch (error) {
        console.error('Error processing the CSV files:', error);
    }
}

processFiles();