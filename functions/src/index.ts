import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

// Same region as Firestore and Storage (Johannesburg). maxInstances keeps a
// runaway trigger from scaling up the bill during the pilot.
setGlobalOptions({ region: 'africa-south1', maxInstances: 10 });

// Triggers (onSubmission, onReview, daily scheduler) land in step 7.
