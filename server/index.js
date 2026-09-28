import { appConfig } from './config/index.js';
import { seedDemoData } from './data/seedData.js';
import { createApp } from './app.js';

const seedResult = seedDemoData();
if (seedResult.seeded) {
  console.log(`Loaded demo data: ${seedResult.studies} studies, ${seedResult.proposals} proposals, ${seedResult.openDlq} open DLQ records.`);
}

const app = createApp();
app.listen(appConfig.port, () => {
  console.log(`Clinical metadata platform running on http://localhost:${appConfig.port}`);
});
