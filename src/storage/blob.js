const { BlobServiceClient } = require('@azure/storage-blob');
const { ClientSecretCredential } = require('@azure/identity');
const config = require('../config');
const logger = require('../utils/logger');

// All recordings live under this prefix ("folder") inside the container.
const PREFIX = 'claims-agent';

let containerClient = null;
let initAttempted = false;

/**
 * Lazily build (and cache) the container client. Returns null when Azure
 * storage is not fully configured, so callers can fall back to local disk.
 */
function getContainerClient() {
  if (containerClient) return containerClient;
  if (initAttempted) return containerClient; // already failed/unconfigured

  initAttempted = true;
  const { storageAccount, containerName, tenantId, clientId, clientSecret } = config.azureStorage;

  if (!storageAccount || !containerName || !tenantId || !clientId || !clientSecret) {
    logger.warn('Azure Blob storage not configured — using local disk for audio');
    return null;
  }

  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const serviceClient = new BlobServiceClient(
      `https://${storageAccount}.blob.core.windows.net`,
      credential
    );
    containerClient = serviceClient.getContainerClient(containerName);
    logger.info(`Azure Blob storage ready: ${storageAccount}/${containerName}/${PREFIX}`);
  } catch (err) {
    logger.error('Failed to init Azure Blob storage:', err.message);
    containerClient = null;
  }
  return containerClient;
}

function isConfigured() {
  return getContainerClient() !== null;
}

/**
 * Upload a WAV buffer to claims-agent/<name>. Returns the stored blob name
 * (e.g. "claims-agent/123-hearing-loss.wav") to persist in the DB.
 */
async function uploadAudio(name, buffer) {
  const container = getContainerClient();
  if (!container) throw new Error('Azure Blob storage is not configured');
  const blobName = `${PREFIX}/${name}`;
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: 'audio/wav' },
  });
  return blobName;
}

/** Fetch blob size (used to build Content-Range headers). */
async function getAudioProperties(blobName) {
  const container = getContainerClient();
  if (!container) throw new Error('Azure Blob storage is not configured');
  const props = await container.getBlobClient(blobName).getProperties();
  return { contentLength: props.contentLength };
}

/**
 * Return a Node Readable stream for the blob, optionally for a byte range.
 * offset/count map to Azure's range download (count = number of bytes).
 */
async function downloadAudio(blobName, offset = 0, count = undefined) {
  const container = getContainerClient();
  if (!container) throw new Error('Azure Blob storage is not configured');
  const resp = await container.getBlobClient(blobName).download(offset, count);
  return resp.readableStreamBody;
}

async function audioExists(blobName) {
  const container = getContainerClient();
  if (!container) return false;
  return container.getBlobClient(blobName).exists();
}

module.exports = {
  PREFIX,
  isConfigured,
  uploadAudio,
  getAudioProperties,
  downloadAudio,
  audioExists,
};
