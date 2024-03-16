var { withFilter } = require('graphql-subscriptions');

module.exports = {
  name: 'notifications',
  typeDefs: `
        notificationInserted(subdomain: String!, userId: String): Notification
        notificationRead(userId: String): JSON
		`,
  generateResolvers: (graphqlPubsub) => {
    return {
      /*
       * Listen for notification
       */
      notificationInserted: {
        resolve(
          payload,
          _params,
          { dataSources: { gatewayDataSource } },
          info,
        ) {
          return gatewayDataSource.queryAndMergeMissingData({
            payload,
            info,
            queryVariables: { _id: payload.notificationInserted._id },
            buildQueryUsingSelections: (selections) => `
              query Subscription_GetNotification($_id: String!) {
                notificationDetail(_id: $_id) {
                  ${selections}
                }
              }
          `,
          });
        },
        subscribe: (_, { userId, subdomain }, context) => {
          if (subdomain !== context?.subdomain) {
            console.error(
              `subscribe error: Parameter subdomain ${subdomain} and context subdomain ${context.subdomain} doesn't match`,
            );
          }
          return graphqlPubsub.asyncIterator(
            `notificationInserted:${subdomain}:${userId}`,
          );
        },
      },

      notificationRead: {
        subscribe: (_, { userId }) =>
          graphqlPubsub.asyncIterator(`notificationRead:${userId}`),
      },
    };
  },
};
