const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

exports.uploadImageToAzure = async (
  fileBuffer,
  originalName,
  folder = 'artworks'
) => {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || 'biobeats-assets';

    if (!connectionString) {
      throw new Error('Azure Storage connection string is missing in .env');
    }

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    await containerClient.createIfNotExists({ access: 'blob' });

    const extension = path.extname(originalName);
    const blobName = `${folder}/artwork-${Date.now()}${extension}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(fileBuffer);

    return blockBlobClient.url;
  } catch (error) {
    throw new Error(`Failed to upload: ${error.message}`);
  }
};
