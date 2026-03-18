require('dotenv').config();
const amqp = require('amqplib');
const mongoose = require('mongoose');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { generateRealWaveform } = require('../utils/audioUtils');
const Track = require('../models/trackModel');

if (!global.crypto) {
  global.crypto = require('node:crypto').webcrypto;
}

console.log('🛠️ Crypto polyfill loaded. Worker ready.');

mongoose
  .connect(
    process.env.DATABASE.replace('<db_password>', process.env.DATABASE_PASSWORD)
  )
  .then(() => console.log('📦 [Worker] Connected to MongoDB'))
  .catch((err) => console.error('❌ [Worker] DB Connection Error:', err));

const startWorker = async () => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  const queueName = 'audio_processing_queue';
  await channel.assertQueue(queueName, { durable: true });
  channel.prefetch(1);
  console.log(`🎧 [Worker] Listening for tasks in '${queueName}'...`);

  channel.consume(
    queueName,
    async (msg) => {
      if (msg !== null) {
        const ticket = JSON.parse(msg.content.toString());
        console.log(`\n📥 [Worker] Processing Track ID: ${ticket.trackId}`);

        const tempDir = path.join(
          __dirname,
          '../../temp_audio',
          ticket.trackId
        );
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const inputPath = path.join(tempDir, 'input.mp3');
        const outputDir = path.join(tempDir, 'hls');
        if (!fs.existsSync(outputDir))
          fs.mkdirSync(outputDir, { recursive: true });

        try {
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
          );
          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_CONTAINER_NAME
          );

          console.log(`⏳ [1/4] Downloading audio from Azure via SDK...`);
          const originalBlobName = ticket.audioUrl.split('/').pop();
          const downloadBlobClient =
            containerClient.getBlobClient(originalBlobName);
          const downloadResponse = await downloadBlobClient.download(0);
          const writer = fs.createWriteStream(inputPath);
          downloadResponse.readableStreamBody.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          console.log(`⏳ [1.5/4] Extracting real duration...`);
          const stats = fs.statSync(inputPath);
          const realSizeBytes = stats.size;

          const realDurationSeconds = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
              if (err) {
                console.error('Failed to probe audio:', err);
                reject(err);
              } else {
                resolve(Math.round(metadata.format.duration));
              }
            });
          });

          console.log(`⏳ [2/4] Transcoding to HLS...`);
          const m3u8Path = path.join(outputDir, 'playlist.m3u8');
          await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
              .outputOptions([
                '-vn',
                '-c:a aac',
                '-b:a 128k',
                '-hls_time 10',
                '-hls_list_size 0',
                '-f hls',
              ])
              .output(m3u8Path)
              .on('end', () => resolve())
              .on('error', (err, stdout, stderr) => {
                console.error('\n🔥 [FFmpeg Error]:', stderr);
                reject(err);
              })
              .run();
          });

          console.log(`⏳ [3/4] Uploading HLS chunks to Azure...`);
          const hlsFiles = fs.readdirSync(outputDir);
          const uploadedUrls = await Promise.all(
            hlsFiles.map(async (file) => {
              const filePath = path.join(outputDir, file);
              const blobName = `hls/${ticket.trackId}/${file}`;
              const blockBlobClient =
                containerClient.getBlockBlobClient(blobName);

              let contentType = 'application/octet-stream';
              if (file.endsWith('.m3u8'))
                contentType = 'application/vnd.apple.mpegurl';
              if (file.endsWith('.ts')) contentType = 'video/MP2T';

              await blockBlobClient.uploadFile(filePath, {
                blobHTTPHeaders: { blobContentType: contentType },
              });
              return file.endsWith('.m3u8') ? blockBlobClient.url : '';
            })
          );
          const finalHlsUrl = uploadedUrls.find((url) => url) || '';

          console.log(`⏳ [4/4] Updating Database and Cleaning up...`);
          const waveformData = await generateRealWaveform(inputPath);
          await Track.findByIdAndUpdate(ticket.trackId, {
            processingState: 'Finished',
            size: realSizeBytes,
            hlsUrl: finalHlsUrl,
            duration: realDurationSeconds,
            waveform: waveformData,
          });

          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(
            `✅ [Worker] SUCCESS! Track ${ticket.trackId} is fully processed and on Azure.`
          );
          channel.ack(msg);
        } catch (error) {
          console.error(`❌ [Worker] Failed:`, error);
          if (fs.existsSync(tempDir))
            fs.rmSync(tempDir, { recursive: true, force: true });
          channel.ack(msg);
        }
      }
    },
    { noAck: false }
  );
};

startWorker();
