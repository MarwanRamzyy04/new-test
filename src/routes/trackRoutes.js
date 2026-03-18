const express = require('express');
const trackController = require('../controllers/trackController');
const { protect } = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.post('/upload', protect, trackController.initiateUpload);
router.patch('/:id/confirm', protect, trackController.confirmUpload);
router.patch('/:id/metadata', protect, trackController.updateMetadata);
router.patch('/:id/visibility', protect, trackController.updateVisibility);
router.patch(
  '/:id/artwork',
  protect,
  uploadMiddleware.single('artwork'),
  trackController.uploadArtwork
);
router.get('/:id/download', protect, trackController.downloadTrack);
router.delete('/:id', protect, trackController.deleteTrack);
router.get('/:permalink', trackController.getTrack);

module.exports = router;
