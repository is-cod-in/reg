const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CLOUDFLARE_API_URL = `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`;

async function processPullRequest() {
    const recordsDir = path.join(__dirname, 'records');
    const files = fs.readdirSync(recordsDir);
    
    for (const file of files) {
        const filePath = path.join(recordsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        
        if (content) {
            const records = parseDNSRecords(content);
            for (const record of records) {
                console.log(`Processing record: ${JSON.stringify(record)}`);
                await addDNSRecord(file.replace('.txt', ''), record);
            }
        }
    }
}

function parseDNSRecords(content) {
    return content.split('\n').map(line => {
        const parts = line.split(' ');
        const type = parts[0];
        const value = parts.slice(1, -1).join(' '); // Join all but the last part for the value
        const priority = parts.length > 2 && type === 'MX' ? parseInt(parts[parts.length - 1]) : null;

        return {
            type,
            value,
            priority
        };
    });
}

async function addDNSRecord(subdomain, record) {
    const data = {
        type: record.type,
        name: `${subdomain}.is-cod.in`,
        ttl: 1,
        proxied: false,
        content: record.value
    };

    if (record.type === 'MX' && record.priority !== null) {
        data.priority = record.priority;
    }

    console.log(`Checking for existing records for: ${data.name} (${record.type})`);

    try {
        const existingRecordsResponse = await axios.get(CLOUDFLARE_API_URL, {
            headers: {
                'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                name: data.name,
                type: record.type
            }
        });

        const existingRecords = existingRecordsResponse.data.result;

        if (existingRecords.length > 0) {
            console.log(`Record already exists: ${JSON.stringify(existingRecords)}`);
            return; // Skip adding if it already exists
        }
    } catch (error) {
        console.error(`Error checking existing records: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        return;
    }

    console.log(`Sending to Cloudflare: ${JSON.stringify(data)}`);

    try {
        const response = await axios.post(CLOUDFLARE_API_URL, data, {
            headers: {
                'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            console.log(`Successfully added DNS record: ${JSON.stringify(response.data.result)}`);
        } else {
            console.error(`Error adding DNS record: ${JSON.stringify(response.data.errors)}`);
        }
    } catch (error) {
        console.error(`Error adding DNS record: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
}

processPullRequest();
