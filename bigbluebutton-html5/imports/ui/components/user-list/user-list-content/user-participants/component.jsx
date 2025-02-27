import React, { Component } from 'react';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import { defineMessages } from 'react-intl';
import PropTypes from 'prop-types';
import cx from 'classnames';
import { styles } from '/imports/ui/components/user-list/user-list-content/styles';
import _ from 'lodash';
import { findDOMNode } from 'react-dom';
import UserListItemContainer from './user-list-item/container';
import UserOptionsContainer from './user-options/container';

const propTypes = {
  compact: PropTypes.bool,
  intl: PropTypes.shape({
    formatMessage: PropTypes.func.isRequired,
  }).isRequired,
  currentUser: PropTypes.shape({}).isRequired,
  meeting: PropTypes.shape({}).isRequired,
  users: PropTypes.arrayOf(PropTypes.shape({})).isRequired,
  getGroupChatPrivate: PropTypes.func.isRequired,
  handleEmojiChange: PropTypes.func.isRequired,
  isBreakoutRoom: PropTypes.bool,
  setEmojiStatus: PropTypes.func.isRequired,
  assignPresenter: PropTypes.func.isRequired,
  removeUser: PropTypes.func.isRequired,
  toggleVoice: PropTypes.func.isRequired,
  muteAllUsers: PropTypes.func.isRequired,
  muteAllExceptPresenter: PropTypes.func.isRequired,
  changeRole: PropTypes.func.isRequired,
  getAvailableActions: PropTypes.func.isRequired,
  normalizeEmojiName: PropTypes.func.isRequired,
  isMeetingLocked: PropTypes.func.isRequired,
  roving: PropTypes.func.isRequired,
  toggleUserLock: PropTypes.func.isRequired,
  requestUserInformation: PropTypes.func.isRequired,
};

const defaultProps = {
  compact: false,
  isBreakoutRoom: false,
};

const listTransition = {
  enter: styles.enter,
  enterActive: styles.enterActive,
  appear: styles.appear,
  appearActive: styles.appearActive,
  leave: styles.leave,
  leaveActive: styles.leaveActive,
};

const intlMessages = defineMessages({
  usersTitle: {
    id: 'app.userList.usersTitle',
    description: 'Title for the Header',
  },
});

const ROLE_MODERATOR = Meteor.settings.public.user.role_moderator;

class UserParticipants extends Component {
  constructor() {
    super();

    this.state = {
      selectedUser: null,
    };

    this.userRefs = [];

    this.getScrollContainerRef = this.getScrollContainerRef.bind(this);
    this.rove = this.rove.bind(this);
    this.changeState = this.changeState.bind(this);
    this.getUsers = this.getUsers.bind(this);
  }

  componentDidMount() {
    const { compact } = this.props;
    if (!compact) {
      this.refScrollContainer.addEventListener(
        'keydown',
        this.rove,
      );
    }
  }

  componentWillUnmount() {
    this.refScrollContainer.removeEventListener('keydown', this.rove);
  }

  shouldComponentUpdate(nextProps, nextState) {
    const isPropsEqual = _.isEqual(this.props, nextProps);
    const isStateEqual = _.isEqual(this.state, nextState);
    return !isPropsEqual || !isStateEqual;
  }

  componentDidUpdate(prevProps, prevState) {
    const { selectedUser } = this.state;

    if (selectedUser === prevState.selectedUser) return;

    if (selectedUser) {
      const { firstChild } = selectedUser;
      if (firstChild) firstChild.focus();
    }
  }

  getScrollContainerRef() {
    return this.refScrollContainer;
  }

  getUsers() {
    const {
      compact,
      isBreakoutRoom,
      meeting,
      getAvailableActions,
      normalizeEmojiName,
      isMeetingLocked,
      changeRole,
      assignPresenter,
      setEmojiStatus,
      removeUser,
      toggleVoice,
      getGroupChatPrivate,
      handleEmojiChange,
      getEmojiList,
      getEmoji,
      users,
      hasPrivateChatBetweenUsers,
      toggleUserLock,
      requestUserInformation,
      currentUser,
    } = this.props;

    let index = -1;

    return users.map(u => (
      <CSSTransition
        classNames={listTransition}
        appear
        enter
        exit
        timeout={0}
        component="div"
        className={cx(styles.participantsList)}
        key={u.userId}
      >
        <div ref={(node) => { this.userRefs[index += 1] = node; }}>
          <UserListItemContainer
            {...{
              compact,
              isBreakoutRoom,
              meeting,
              getAvailableActions,
              normalizeEmojiName,
              isMeetingLocked,
              handleEmojiChange,
              getEmojiList,
              getEmoji,
              setEmojiStatus,
              assignPresenter,
              removeUser,
              toggleVoice,
              changeRole,
              getGroupChatPrivate,
              hasPrivateChatBetweenUsers,
              toggleUserLock,
              requestUserInformation,
              currentUser,
            }}
            user={u}
            getScrollContainerRef={this.getScrollContainerRef}
          />
        </div>
      </CSSTransition>
    ));
  }

  rove(event) {
    const { roving } = this.props;
    const { selectedUser } = this.state;
    const usersItemsRef = findDOMNode(this.refScrollItems);
    roving(event, this.changeState, usersItemsRef, selectedUser);
  }

  changeState(ref) {
    this.setState({ selectedUser: ref });
  }

  render() {
    const {
      intl,
      users,
      compact,
      setEmojiStatus,
      muteAllUsers,
      meeting,
      muteAllExceptPresenter,
      currentUser,
    } = this.props;

    return (
      <div className={styles.userListColumn}>
        {
          !compact
            ? (
              <div className={styles.container}>
                <h2 className={styles.smallTitle}>
                  {intl.formatMessage(intlMessages.usersTitle)}
                  &nbsp;(
                  {users.length}
                  )
                </h2>
                {currentUser.role === ROLE_MODERATOR
                  ? (
                    <UserOptionsContainer {...{
                      users,
                      muteAllUsers,
                      muteAllExceptPresenter,
                      setEmojiStatus,
                      meeting,
                    }}
                    />
                  ) : null
                }

              </div>
            )
            : <hr className={styles.separator} />
        }
        <div
          className={styles.scrollableList}
          tabIndex={0}
          ref={(ref) => { this.refScrollContainer = ref; }}
        >
          <div className={styles.list}>
            <TransitionGroup ref={(ref) => { this.refScrollItems = ref; }}>
              {this.getUsers()}
            </TransitionGroup>
          </div>
        </div>
      </div>
    );
  }
}

UserParticipants.propTypes = propTypes;
UserParticipants.defaultProps = defaultProps;

export default UserParticipants;
