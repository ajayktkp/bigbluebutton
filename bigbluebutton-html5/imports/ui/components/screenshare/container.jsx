import React from 'react';
import { withTracker } from 'meteor/react-meteor-data';
import Users from '/imports/api/users/';
import Auth from '/imports/ui/services/auth';
import {
  isVideoBroadcasting, presenterScreenshareHasEnded, unshareScreen,
  presenterScreenshareHasStarted,
} from './service';
import ScreenshareComponent from './component';

const ScreenshareContainer = (props) => {
  const { isVideoBroadcasting: isVB } = props;
  if (isVB()) {
    return <ScreenshareComponent {...props} />;
  }
  return null;
};

export default withTracker(() => {
  const user = Users.findOne({ userId: Auth.userID });
  return {
    isPresenter: user.presenter,
    unshareScreen,
    isVideoBroadcasting,
    presenterScreenshareHasStarted,
    presenterScreenshareHasEnded,
  };
})(ScreenshareContainer);
