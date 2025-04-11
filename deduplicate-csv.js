// deduplicate-csv.js
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

/**
 * Removes duplicate entries from CSV file based on the title field
 * @param {string} inputFile - Path to the input CSV file
 * @param {string} outputFile - Path to save the deduplicated CSV file
 * @returns {Promise<number>} - Number of duplicates removed
 */
async function removeDuplicatesFromCsv(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        try {
            const results = [];
            const titleSet = new Set();
            let duplicatesCount = 0;
            let totalRows = 0;
      
            fs.createReadStream(inputFile)
                .pipe(csv())
                .on('data', (data) => {
                    totalRows++;
                    // Check if we've seen this title before
                    if (!titleSet.has(data.title)) {
                        titleSet.add(data.title);
                        results.push(data);
                    } else {
                        duplicatesCount++;
                    }
                })
                .on('end', async () => {
                    // Write the deduplicated results to a new file
                    const csvWriter = createCsvWriter({
                        path: outputFile,
                        header: [
                            { id: 'link', title: 'link' },
                            { id: 'title', title: 'title' },
                            { id: 'date', title: 'date' },
                            { id: 'date span', title: 'date span' },
                            { id: 'page', title: 'page' },
                            { id: 'number', title: 'number' }
                        ]
                    });
          
                    await csvWriter.writeRecords(results);
          
                    console.log('Processing complete!');
                    console.log(`Total rows processed: ${totalRows}`);
                    console.log(`Duplicates removed: ${duplicatesCount}`);
                    console.log(`Rows in output file: ${results.length}`);
          
                    resolve(duplicatesCount);
                })
                .on('error', (err) => {
                    reject(err);
                });
        } catch (error) {
            reject(error);
        }
    });
}

// Main execution
async function main() {
    const inputFile = 'results.csv';
    const outputFile = 'results-deduplicated.csv';
  
    console.log('Starting deduplication process...');
    console.log(`Input file: ${inputFile}`);
    console.log(`Output file will be saved as: ${outputFile}`);
  
    try {
        const startTime = Date.now();
        const duplicatesRemoved = await removeDuplicatesFromCsv(inputFile, outputFile);
        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;
    
        console.log(`Deduplication completed in ${processingTime.toFixed(2)} seconds`);
        console.log(`${duplicatesRemoved} duplicate entries were removed`);
        console.log(`Deduplicated file saved as: ${outputFile}`);
    } catch (error) {
        console.error(`Error during deduplication process: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main();