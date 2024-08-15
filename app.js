import express from 'express';
import { listFilesAndProcess } from './controls/control.js';

const app = express();
const PORT = process.env.PORT || 3000;


console.log('Starting file processing...');
listFilesAndProcess()
  .then(() => {
    console.log('File processing completed successfully.');
  })
  .catch((error) => {
    console.error('An error occurred during file processing:', error);
  });

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
