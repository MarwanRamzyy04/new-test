const express = require('express');
const profileController = require('../controllers/profileController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.patch('/privacy', protect, profileController.updatePrivacy);
router.patch('/social-links', protect, profileController.updateSocialLinks);
router.delete(
  '/social-links/:linkId',
  protect,
  profileController.removeSocialLink
);
router.patch('/tier', protect, profileController.updateTier);
router.patch('/update', protect, profileController.updateProfile);
router.patch(
  '/upload-images',
  protect,
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  profileController.uploadProfileImages
);
router.get('/:permalink', profileController.getProfileByPermalink);

module.exports = router;
