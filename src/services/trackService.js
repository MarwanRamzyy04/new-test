const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const Track = require('../models/trackModel');
const { uploadImageToAzure } = require('../utils/azureStorage');
const { publishToQueue } = require('../utils/queueProducer');

exports.updateTrackMetadata = async (trackId, userId, metadataBody) => {
  const allowedUpdates = {};
  const allowedFields = [
    'title',
    'description',
    'genre',
    'tags',
    'releaseDate',
  ];

  allowedFields.forEach((field) => {
    if (metadataBody[field] !== undefined)
      allowedUpdates[field] = metadataBody[field];
  });

  const track = await Track.findOneAndUpdate(
    { _id: trackId, artist: userId },
    { $set: allowedUpdates },
    { new: true, runValidators: true }
  );

  if (!track)
    throw new Error('Track not found or you do not have permission to edit it');
  return track;
};

exports.toggleTrackVisibility = async (trackId, userId, isPublic) => {
  const track = await Track.findById(trackId);
  if (!track) throw new Error('Track not found');
  if (track.artist.toString() !== userId.toString()) {
    throw new Error('You do not have permission to edit this track');
  }
  track.isPublic = isPublic;
  await track.save();
  return track;
};

exports.updateTrackArtwork = async (trackId, userId, file) => {
  const track = await Track.findById(trackId);
  if (!track) throw new Error('Track not found');
  if (track.artist.toString() !== userId.toString()) {
    throw new Error('You do not have permission to edit this track');
  }

  const artworkUrl = await uploadImageToAzure(
    file.buffer,
    file.originalname,
    'artworks'
  );
  track.artworkUrl = artworkUrl;
  await track.save();
  return track;
};

exports.generateUploadUrl = async (user, trackData) => {
  const { title, format, size, duration } = trackData;

  if (!user.isPremium) {
    const trackCount = await Track.countDocuments({ artist: user._id });
    if (trackCount >= 3) {
      throw new Error(
        'Upload limit reached. Free accounts are limited to 3 tracks. Please upgrade to Pro.'
      );
    }
  }

  const ALLOWED_FORMATS = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
  ];
  if (!format || !ALLOWED_FORMATS.includes(format)) {
    throw new Error(
      `Unsupported format "${format}". Accepted formats: MP3 (audio/mpeg) and WAV (audio/wav).`
    );
  }

  const accountName = process.env.AZURE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_ACCOUNT_KEY;
  const containerName = process.env.AZURE_CONTAINER_NAME || 'biobeats-audio';

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey
  );

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const extension = format.includes('wav') ? '.wav' : '.mp3';
  const blobName = `track-${uniqueSuffix}${extension}`;

  const sasOptions = {
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse('cw'),
    startsOn: new Date(),
    expiresOn: new Date(new Date().valueOf() + 15 * 60 * 1000),
  };

  const sasToken = generateBlobSASQueryParameters(
    sasOptions,
    sharedKeyCredential
  ).toString();
  const uploadUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;
  const finalAudioUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

  const newTrack = await Track.create({
    title: title || 'Untitled Track',
    artist: user._id,
    format,
    size,
    duration: Math.round(duration),
    audioUrl: finalAudioUrl,
    processingState: 'Processing',
  });

  return { trackId: newTrack._id, uploadUrl };
};

exports.confirmUpload = async (trackId, userId) => {
  const track = await Track.findOne({ _id: trackId, artist: userId });
  if (!track) throw new Error('Track not found.');

  track.processingState = 'Processing';
  await track.save();

  await publishToQueue('audio_processing_queue', {
    trackId: track._id.toString(),
    audioUrl: track.audioUrl,
  });

  return track;
};

// FIX: explicitly excludes audioUrl from the query
// audioUrl is the raw Azure blob — exposing it lets anyone download without going through
// the premium gate. Frontend streams via hlsUrl only.
exports.getTrackByPermalink = async (permalink) => {
  const track = await Track.findOne({ permalink })
    .select('-audioUrl')
    .populate('artist', 'displayName permalink avatarUrl isPremium');

  if (!track || track.processingState !== 'Finished') {
    throw new Error('Track not found or is still processing.');
  }

  return track;
};

exports.downloadTrackAudio = async (trackId, user) => {
  if (!user.isPremium) {
    throw new Error(
      'Requires Premium Subscription (Go+ or Pro) for offline listening.'
    );
  }

  const track = await Track.findById(trackId);
  if (!track || track.processingState !== 'Finished') {
    throw new Error('Track not found or not ready.');
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_CONTAINER_NAME;
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  const blobName = track.audioUrl.split('/').pop();
  const blobClient = containerClient.getBlobClient(blobName);
  const downloadResponse = await blobClient.download(0);

  return {
    stream: downloadResponse.readableStreamBody,
    contentType: downloadResponse.contentType,
    contentLength: downloadResponse.contentLength,
    filename: `${track.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp3`,
  };
};

exports.deleteTrack = async (trackId, userId) => {
  const track = await Track.findById(trackId);
  if (!track) throw new Error('Track not found.');
  if (track.artist.toString() !== userId.toString()) {
    throw new Error('Unauthorized: You can only delete your own tracks.');
  }

  if (track.audioUrl) {
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName =
        process.env.AZURE_CONTAINER_NAME || 'biobeats-audio';
      const blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      const blobName = track.audioUrl.split('/').pop();
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.deleteIfExists();
    } catch (azureError) {
      console.error('[Azure Error] Failed to delete file:', azureError.message);
    }
  }

  await track.deleteOne();
  return true;
};
