const mongoose = require('mongoose');
const slug = require('mongoose-slug-updater');

mongoose.plugin(slug);

const trackSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'A track must have a title'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    permalink: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      slug: 'title',
      slugPaddingSize: 1,
      index: true,
    },
    artist: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'A track must belong to an artist (user)'],
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      trim: true,
    },
    genre: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    releaseDate: {
      type: Date,
      default: Date.now,
    },
    artworkUrl: {
      type: String,
      default: 'default-track-artwork.png',
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    audioUrl: {
      type: String,
    },
    hlsUrl: {
      type: String,
    },
    waveform: {
      type: [Number],
      default: [],
    },
    format: {
      type: String,
      required: [true, 'Audio format (MIME type) is required'],
    },
    size: {
      type: Number,
      required: [true, 'File size in bytes is required for storage tracking'],
    },
    duration: {
      type: Number,
    },
    processingState: {
      type: String,
      enum: ['Processing', 'Finished', 'Failed'],
      default: 'Processing',
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    playCount: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    repostCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

trackSchema.index({ artist: 1 });
trackSchema.index({ processingState: 1 });
trackSchema.index({ createdAt: -1 });

const Track = mongoose.model('Track', trackSchema);

module.exports = Track;
