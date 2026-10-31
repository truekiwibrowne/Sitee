import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

// us-central1 matches the nam5 Firestore location, which Firestore triggers
// require. maxInstances keeps a runaway trigger from scaling up the bill.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

export { openChest } from './chest.js';
export { hourlyTick } from './daily.js';
export { startDemo } from './demo.js';
export { onReview, onSubmission } from './work.js';
