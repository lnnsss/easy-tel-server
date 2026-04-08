import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import userOnly from '../middleware/userOnly.middleware.js';
import {
    acceptFriendRequest,
    cancelFriendRequest,
    createOrUpdateCompanionRequest,
    createFriendRequest,
    declineFriendRequest,
    getCompanionRequests,
    getFriendsList,
    getIncomingRequests,
    getOutgoingRequests,
    removeFriend,
    searchUsers,
    withdrawCompanionRequest
} from '../controllers/friends.controller.js';

const router = Router();

router.use(auth, userOnly);

router.get('/search', searchUsers);
router.get('/list', getFriendsList);
router.get('/requests/incoming', getIncomingRequests);
router.get('/requests/outgoing', getOutgoingRequests);
router.get('/companion-requests', getCompanionRequests);
router.post('/companion-requests', createOrUpdateCompanionRequest);
router.delete('/companion-requests/me', withdrawCompanionRequest);
router.post('/requests', createFriendRequest);
router.post('/requests/:id/accept', acceptFriendRequest);
router.post('/requests/:id/decline', declineFriendRequest);
router.post('/requests/:id/cancel', cancelFriendRequest);
router.delete('/:friendUserId', removeFriend);

export default router;
