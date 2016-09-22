'use strict';

const Path = require('path');
const Hapi = require('hapi');
const Hoek = require('hoek');

const server = new Hapi.Server();
const lookout = require('stellar-lookout');
const normalizeNewline = require('normalize-newline');
const _ = require('lodash');
const moment = require('moment');

server.connection({
    port: Number(process.argv[2] || 8080),
    host: '0.0.0.0'
});

server.register(require('vision'), (err) => {

  Hoek.assert(!err, err);

  server.views({
    engines: {
      html: require('handlebars')
    },
    relativeTo: __dirname,
    path: 'templates',
    helpersPath: 'helpers',
    layout: true,
    layoutPath: Path.join(__dirname, 'templates/layout')
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
      reply.view('index');
    },config: {
      state: {
        parse: false, // parse and store in request.state
        failAction: 'ignore' // may also be 'ignore' or 'log'
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/{number}',
    handler: function (request, reply) {
      lookout.getInfo({
        integration: 'twilio',
        external_id: request.params.number,
      })
      .then(accountInfo => {
        manageHandler(accountInfo, reply);
      })
      .catch(error => {
        console.log(error)
        reply.view('signup', {
          requestPhone: 'hi',
        });
        return;
      })

    },config: {
      state: {
        parse: false, // parse and store in request.state
        failAction: 'ignore' // may also be 'ignore' or 'log'
      }
    }
  });

  server.route({
    method: 'POST',config: {
      state: {
        parse: false, // parse and store in request.state
        failAction: 'ignore' // may also be 'ignore' or 'log'
      }
    },
    path: '/{number}',
    handler: function (request, reply) {
        // debugger;
      lookout.getInfo({
        integration: 'twilio',
        external_id: request.params.number,
      })
      .then(accountInfo => {
        if (request.payload.setSubscriptions) {

          var subs = normalizeNewline(request.payload.subscriptions).split('\n');
          return lookout.setSubscriptions(accountInfo, subs)
          .then(newSubs => {
            manageHandler(Object.assign({},accountInfo, {accounts: newSubs}), reply);
            return
          })
          .catch(setSubscriptionsError => {
            console.error(setSubscriptionsError)
          })
        }
        manageHandler(accountInfo, reply);

      })
      .catch(error => {
        if (request.payload.activate) {
          let expiration = new Date();
          expiration.setTime(expiration.getTime() + 30 * 86400000 );

          return lookout.createAccount({
            integration: 'twilio',
            external_id: request.params.number,
          }, {
            expiration,
          })
          .then(accountInfo => {
            manageHandler(accountInfo, reply);
            return;
          })
          .catch(console.error)
        }
        reply.view('signup', {
          requestPhone: 'hi',
          number: accountInfo.external_id,
        });
      })
    }
  });
});

function manageHandler(accountInfo, reply) {
  var subs = _.map(accountInfo.accounts).join('\n');

  reply.view('manage', {
    accountInfo,
    subs,
    expiration: moment(accountInfo.expiration).format("MMMM Do YYYY"),
    number: accountInfo.external_id,
  });
}

server.start((err) => {
    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});