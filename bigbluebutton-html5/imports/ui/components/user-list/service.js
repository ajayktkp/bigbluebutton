import Users from '/imports/api/users';
import GroupChat from '/imports/api/group-chat';
import { GroupChatMsg } from '/imports/api/group-chat-msg';
import Breakouts from '/imports/api/breakouts/';
import Meetings from '/imports/api/meetings';
import Auth from '/imports/ui/services/auth';
import UnreadMessages from '/imports/ui/services/unread-messages';
import Storage from '/imports/ui/services/storage/session';
import mapUser from '/imports/ui/services/user/mapUser';
import { EMOJI_STATUSES } from '/imports/utils/statuses';
import { makeCall } from '/imports/ui/services/api';
import _ from 'lodash';
import KEY_CODES from '/imports/utils/keyCodes';
import AudioService from '/imports/ui/components/audio/service';
import logger from '/imports/startup/client/logger';

const CHAT_CONFIG = Meteor.settings.public.chat;
const PUBLIC_GROUP_CHAT_ID = CHAT_CONFIG.public_group_id;
const ROLE_MODERATOR = Meteor.settings.public.user.role_moderator;
const ROLE_VIEWER = Meteor.settings.public.user.role_viewer;

const DIAL_IN_CLIENT_TYPE = 'dial-in-user';

// session for closed chat list
const CLOSED_CHAT_LIST_KEY = 'closedChatList';

const mapActiveChats = (chat) => {
  const currentUserId = Auth.userID;

  if (chat.sender !== currentUserId) {
    return chat.sender;
  }

  const { chatId } = chat;

  const userId = GroupChat.findOne({ chatId }).users.filter(user => user !== currentUserId);

  return userId[0];
};

const CUSTOM_LOGO_URL_KEY = 'CustomLogoUrl';

export const setCustomLogoUrl = path => Storage.setItem(CUSTOM_LOGO_URL_KEY, path);

const getCustomLogoUrl = () => Storage.getItem(CUSTOM_LOGO_URL_KEY);

const sortUsersByName = (a, b) => {
  const aName = a.name.toLowerCase();
  const bName = b.name.toLowerCase();

  if (aName < bName) {
    return -1;
  } if (aName > bName) {
    return 1;
  } if (a.userId > b.userId) {
    return -1;
  } if (a.userId < b.userId) {
    return 1;
  }

  return 0;
};

const sortUsersByEmoji = (a, b) => {
  if (a.emoji && b.emoji && (a.emoji !== 'none' && b.emoji !== 'none')) {
    if (a.emojiTime < b.emojiTime) {
      return -1;
    } if (a.emojiTime > b.emojiTime) {
      return 1;
    }
  } if (a.emoji && a.emoji !== 'none') {
    return -1;
  } if (b.emoji && b.emoji !== 'none') {
    return 1;
  }
  return 0;
};

const sortUsersByModerator = (a, b) => {
  if (a.role === ROLE_MODERATOR && b.role === ROLE_MODERATOR) {
    return 0;
  } if (a.role === ROLE_MODERATOR) {
    return -1;
  } if (b.role === ROLE_MODERATOR) {
    return 1;
  }

  return 0;
};

const sortUsersByPhoneUser = (a, b) => {
  if (!a.clientType === DIAL_IN_CLIENT_TYPE && !b.clientType === DIAL_IN_CLIENT_TYPE) {
    return 0;
  } if (!a.clientType === DIAL_IN_CLIENT_TYPE) {
    return -1;
  } if (!b.clientType === DIAL_IN_CLIENT_TYPE) {
    return 1;
  }

  return 0;
};

// current user's name is always on top
const sortUsersByCurrent = (a, b) => {
  if (a.userId === Auth.userID) {
    return -1;
  } if (b.userId === Auth.userID) {
    return 1;
  }

  return 0;
};

const sortUsers = (a, b) => {
  let sort = sortUsersByCurrent(a, b);

  if (sort === 0) {
    sort = sortUsersByModerator(a, b);
  }

  if (sort === 0) {
    sort = sortUsersByEmoji(a, b);
  }

  if (sort === 0) {
    sort = sortUsersByPhoneUser(a, b);
  }

  if (sort === 0) {
    sort = sortUsersByName(a, b);
  }

  return sort;
};

const sortChatsByName = (a, b) => {
  if (a.name.toLowerCase() < b.name.toLowerCase()) {
    return -1;
  } if (a.name.toLowerCase() > b.name.toLowerCase()) {
    return 1;
  } if (a.id.toLowerCase() > b.id.toLowerCase()) {
    return -1;
  } if (a.id.toLowerCase() < b.id.toLowerCase()) {
    return 1;
  }

  return 0;
};

const sortChatsByIcon = (a, b) => {
  if (a.icon && b.icon) {
    return sortChatsByName(a, b);
  } if (a.icon) {
    return -1;
  } if (b.icon) {
    return 1;
  }

  return 0;
};

const isPublicChat = chat => (
  chat.id === 'public'
);

const sortChats = (a, b) => {
  let sort = sortChatsByIcon(a, b);

  if (sort === 0) {
    sort = sortChatsByName(a, b);
  }

  return sort;
};

const userFindSorting = {
  emojiTime: 1,
  role: 1,
  phoneUser: 1,
  sortName: 1,
  userId: 1,
};

const getUsers = () => {
  let users = Users
    .find({
      meetingId: Auth.meetingID,
      connectionStatus: 'online',
    }, userFindSorting)
    .fetch();

  const currentUser = Users.findOne({ userId: Auth.userID });
  if (currentUser && currentUser.role === ROLE_VIEWER && currentUser.locked) {
    const meeting = Meetings.findOne({ meetingId: Auth.meetingID });
    if (meeting && meeting.lockSettingsProps && meeting.lockSettingsProps.hideUserList) {
      const moderatorOrCurrentUser = u => u.role === ROLE_MODERATOR || u.userId === Auth.userID;
      users = users.filter(moderatorOrCurrentUser);
    }
  }

  return users.sort(sortUsers);
};

const hasBreakoutRoom = () => Breakouts.find({ parentMeetingId: Auth.meetingID }).count() > 0;

const getActiveChats = (chatID) => {
  const privateChat = GroupChat
    .find({ users: { $all: [Auth.userID] } })
    .fetch()
    .map(chat => chat.chatId);

  const filter = {
    chatId: { $ne: PUBLIC_GROUP_CHAT_ID },
  };

  if (privateChat) {
    filter.chatId = { $in: privateChat };
  }

  let activeChats = GroupChatMsg
    .find(filter)
    .fetch()
    .map(mapActiveChats);

  if (chatID) {
    activeChats.push(chatID);
  }

  activeChats = _.uniq(_.compact(activeChats));

  activeChats = Users
    .find({ userId: { $in: activeChats } })
    .map(mapUser)
    .map((op) => {
      const activeChat = op;
      activeChat.unreadCounter = UnreadMessages.count(op.id);
      return activeChat;
    });

  const currentClosedChats = Storage.getItem(CLOSED_CHAT_LIST_KEY) || [];
  const filteredChatList = [];

  activeChats.forEach((op) => {
    // When a new private chat message is received, ensure the conversation view is restored.
    if (op.unreadCounter > 0) {
      if (_.indexOf(currentClosedChats, op.id) > -1) {
        Storage.setItem(CLOSED_CHAT_LIST_KEY, _.without(currentClosedChats, op.id));
      }
    }

    // Compare activeChats with session and push it into filteredChatList
    // if one of the activeChat is not in session.
    // It will pass to activeChats.
    if (_.indexOf(currentClosedChats, op.id) < 0) {
      filteredChatList.push(op);
    }
  });

  activeChats = filteredChatList;

  activeChats.push({
    id: 'public',
    name: 'Public Chat',
    icon: 'group_chat',
    unreadCounter: UnreadMessages.count(PUBLIC_GROUP_CHAT_ID),
  });

  return activeChats
    .sort(sortChats);
};

const isVoiceOnlyUser = userId => userId.toString().startsWith('v_');

const isMeetingLocked = (id) => {
  const meeting = Meetings.findOne({ meetingId: id });
  let isLocked = false;

  if (meeting.lockSettingsProps !== undefined) {
    const lockSettings = meeting.lockSettingsProps;

    if (lockSettings.disableCam
      || lockSettings.disableMic
      || lockSettings.disablePrivateChat
      || lockSettings.disablePublicChat
      || lockSettings.disableNote) {
      isLocked = true;
    }
  }

  return isLocked;
};

const areUsersUnmutable = () => {
  const meeting = Meetings.findOne({ meetingId: Auth.meetingID });
  if (meeting.usersProp) {
    return meeting.usersProp.allowModsToUnmuteUsers;
  }
  return false;
};

const getAvailableActions = (currentUser, user, isBreakoutRoom) => {
  const isDialInUser = isVoiceOnlyUser(user.id) || user.isPhoneUser;
  const hasAuthority = currentUser.role === ROLE_MODERATOR || user.isCurrent;

  const allowedToChatPrivately = !user.isCurrent && !isDialInUser;

  const allowedToMuteAudio = hasAuthority
    && user.isVoiceUser
    && !user.isMuted
    && !user.isListenOnly;

  const allowedToUnmuteAudio = hasAuthority
    && user.isVoiceUser
    && !user.isListenOnly
    && user.isMuted
    && (user.isCurrent || areUsersUnmutable());

  const allowedToResetStatus = hasAuthority
    && user.emoji.status !== EMOJI_STATUSES.none
    && !isDialInUser;

  // if currentUser is a moderator, allow removing other users
  const allowedToRemove = currentUser.role === ROLE_MODERATOR && !user.isCurrent && !isBreakoutRoom;

  const allowedToSetPresenter = currentUser.role === ROLE_MODERATOR
    && !user.isPresenter
    && !isDialInUser;

  const allowedToPromote = currentUser.role === ROLE_MODERATOR
    && !user.isCurrent
    && !user.isModerator
    && !isDialInUser
    && !isBreakoutRoom;

  const allowedToDemote = currentUser.role === ROLE_MODERATOR
    && !user.isCurrent
    && user.isModerator
    && !isDialInUser
    && !isBreakoutRoom;

  const allowedToChangeStatus = user.isCurrent;

  const allowedToChangeUserLockStatus = currentUser.role === ROLE_MODERATOR
    && !user.isModerator && isMeetingLocked(Auth.meetingID);

  return {
    allowedToChatPrivately,
    allowedToMuteAudio,
    allowedToUnmuteAudio,
    allowedToResetStatus,
    allowedToRemove,
    allowedToSetPresenter,
    allowedToPromote,
    allowedToDemote,
    allowedToChangeStatus,
    allowedToChangeUserLockStatus,
  };
};

const getCurrentUser = () => {
  const currentUserId = Auth.userID;
  const currentUser = Users.findOne({ userId: currentUserId });

  return (currentUser) ? mapUser(currentUser) : null;
};

const normalizeEmojiName = emoji => (
  emoji in EMOJI_STATUSES ? EMOJI_STATUSES[emoji] : emoji
);

const setEmojiStatus = (userId, emoji) => {
  const statusAvailable = (Object.keys(EMOJI_STATUSES).includes(emoji));

  return statusAvailable
    ? makeCall('setEmojiStatus', Auth.userID, emoji)
    : makeCall('setEmojiStatus', userId, 'none');
};

const assignPresenter = (userId) => { makeCall('assignPresenter', userId); };

const removeUser = (userId) => {
  if (isVoiceOnlyUser(userId)) {
    makeCall('ejectUserFromVoice', userId);
  } else {
    makeCall('removeUser', userId);
  }
};

const toggleVoice = (userId) => {
  if (userId === Auth.userID) {
    AudioService.toggleMuteMicrophone();
  } else {
    makeCall('toggleVoice', userId);
    logger.info({
      logCode: 'usermenu_option_mute_audio',
      extraInfo: { logType: 'moderator_action' },
    }, 'moderator muted user microphone');
  }
};

const muteAllUsers = (userId) => { makeCall('muteAllUsers', userId); };

const muteAllExceptPresenter = (userId) => { makeCall('muteAllExceptPresenter', userId); };

const changeRole = (userId, role) => { makeCall('changeRole', userId, role); };

const roving = (event, changeState, elementsList, element) => {
  this.selectedElement = element;
  const menuOpen = Session.get('dropdownOpen') || false;

  if (menuOpen) {
    const menuChildren = document.activeElement.getElementsByTagName('li');

    if ([KEY_CODES.ESCAPE, KEY_CODES.ARROW_LEFT].includes(event.keyCode)) {
      document.activeElement.click();
    }

    if ([KEY_CODES.ARROW_UP].includes(event.keyCode)) {
      menuChildren[menuChildren.length - 1].focus();
    }

    if ([KEY_CODES.ARROW_DOWN].includes(event.keyCode)) {
      for (let i = 0; i < menuChildren.length; i += 1) {
        if (menuChildren[i].hasAttribute('tabIndex')) {
          menuChildren[i].focus();
          break;
        }
      }
    }

    return;
  }

  if ([KEY_CODES.ESCAPE, KEY_CODES.TAB].includes(event.keyCode)) {
    document.activeElement.blur();
    changeState(null);
  }

  if (event.keyCode === KEY_CODES.ARROW_DOWN) {
    const firstElement = elementsList.firstChild;
    let elRef = element ? element.nextSibling : firstElement;
    elRef = elRef || firstElement;
    changeState(elRef);
  }

  if (event.keyCode === KEY_CODES.ARROW_UP) {
    const lastElement = elementsList.lastChild;
    let elRef = element ? element.previousSibling : lastElement;
    elRef = elRef || lastElement;
    changeState(elRef);
  }

  if ([KEY_CODES.ARROW_RIGHT, KEY_CODES.SPACE, KEY_CODES.ENTER].includes(event.keyCode)) {
    document.activeElement.firstChild.click();
  }
};

const hasPrivateChatBetweenUsers = (senderId, receiverId) => GroupChat
  .findOne({ users: { $all: [receiverId, senderId] } });

const getGroupChatPrivate = (sender, receiver) => {
  if (!hasPrivateChatBetweenUsers(sender.userId, receiver.id)) {
    makeCall('createGroupChat', receiver);
  }
};

const isUserModerator = (userId) => {
  const u = Users.findOne({ userId });
  return u ? u.role === ROLE_MODERATOR : false;
};

const toggleUserLock = (userId, lockStatus) => {
  makeCall('toggleUserLock', userId, lockStatus);
};

const requestUserInformation = (userId) => {
  makeCall('requestUserInformation', userId);
};

export default {
  sortUsers,
  setEmojiStatus,
  assignPresenter,
  removeUser,
  toggleVoice,
  muteAllUsers,
  muteAllExceptPresenter,
  changeRole,
  getUsers,
  getActiveChats,
  getCurrentUser,
  getAvailableActions,
  normalizeEmojiName,
  isMeetingLocked,
  isPublicChat,
  roving,
  setCustomLogoUrl,
  getCustomLogoUrl,
  getGroupChatPrivate,
  hasBreakoutRoom,
  isUserModerator,
  getEmojiList: () => EMOJI_STATUSES,
  getEmoji: () => Users.findOne({ userId: Auth.userID }).emoji,
  hasPrivateChatBetweenUsers,
  toggleUserLock,
  requestUserInformation,
};
