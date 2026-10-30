import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

// Keeps a runaway trigger from scaling up the bill during the pilot.
setGlobalOptions({ maxInstances: 10 });

// Triggers (onSubmission, onReview, daily scheduler) land in step 7.
