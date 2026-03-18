const express = require('express');
const networkController = require('../controllers/networkController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public routes
router.get('/:userId/followers', networkController.getFollowers);
router.get('/:userId/following', networkController.getFollowing);

// Protected routes
router.use(protect);

router.get('/feed', networkController.getFeed);
router.get('/suggested', networkController.getSuggestedUsers);
router.get('/blocked-users', networkController.getBlockedUsers);

router.post('/:id/follow', networkController.followUser);
router.delete('/:id/follow', networkController.unfollowUser);

router.post('/:userId/block', networkController.blockUser);
router.delete('/:userId/block', networkController.unblockUser);

module.exports = router;
