require('node:dns/promises').setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const app = require('./src/app');
const startCronJobs = require('./src/utils/cronJobs');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

connectDB();
startCronJobs();

app.listen(PORT, () =>
  console.log(`🚀 BioBeats Server running on port ${PORT}`)
);
