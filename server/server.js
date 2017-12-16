/* Copyright 2018 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

'use strict';

const PeerServer = require('peer').PeerServer;
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const debug = require('debug')('wall:server');

const playlistDriver = require('server/modules/playlist_driver');
const game = require('./game/game');
const network = require('server/network/network');
const LayoutStateMachine = require('server/modules/layout_state_machine');
const PlaylistLoader = require('server/modules/playlist_loader');
const wallGeometry = require('server/util/wall_geometry');
const Control = require('server/control');
const webapp = require('server/webapp');
const credentials = require('server/util/credentials');
const path = require('path');
const monitor = require('server/monitoring/monitor');
const https = require('https');
const fs = require('fs');

const FLAG_DEFS = [
  {name: 'node_modules_dir', type: String,
      defaultValue: path.join(__dirname, '..', 'node_modules'),
      description: 'If you are running a chicago-brick instance where ' +
          'chicago-brick is a dep and lives in node_modules, you must set ' +
          'this to your project\'s node_modules dir or the /sys path will ' +
          'be set to a nonexistent directory.'},
  {name: 'playlist', type: String, alias: 'p',
      defaultValue: 'config/demo-playlist.json'},
  {name: 'assets_dir', type: String, alias: 'd',
      // demo_modules contains the platform demos.
      // The modules dir should contain your own modules.
      defaultValue: ['demo_modules', 'modules'], multiple: true,
      description: 'List of directories of modules and assets.  Everything ' +
          'under these dirs will be available under ' +
          '/asset/{whatever is under your directories}.'},
  {name: 'module_dir', type: String,
      defaultValue: ['demo_modules'], multiple: true,
      description: 'A directory that will be served to clients that contains module code. May be specified multiple times.'},
  {name: 'module', type: String, alias: 'm', multiple: true,
      description: 'Runs only the selected module or modules.'},
  {name: 'help', type: Boolean},
  {name: 'port', type: Number, defaultValue: 3000},
  {name: 'use_geometry', type: JSON.parse, defaultValue: null},
  {name: 'screen_width', type: Number, defaultValue: 1920},
  {name: 'layout_duration', type: Number},
  {name: 'module_duration', type: Number},
  {name: 'max_partitions', type: Number},
  {name: 'game_server_host', type: String, defaultValue: ''},
  {name: 'geometry_file', type: String},
  {name: 'credential_dir', type: String},
  {name: 'enable_monitoring', type: Boolean},
  {name: 'use_https', type: Boolean, defaultValue: false,
    description: 'Enables HTTPS. Certificates must exist in certs/.'},
  {name: 'require_client_cert', type: Boolean, defaultValue: false,
    description: 'Whether to require HTTPS certs from clients.'}
];
let flags = commandLineArgs(FLAG_DEFS);
if (flags.help) {
  console.log('Available flags: ' + commandLineUsage({optionList: FLAG_DEFS}));
  process.exit();
}
debug('flags', flags);
if (flags.use_geometry) {
  wallGeometry.useGeo(flags.use_geometry);
} else if (flags.geometry_file) {
  wallGeometry.useGeo(wallGeometry.loadGeometry(flags.geometry_file));
} else {
  console.log('No wall geometry specified... assuming 1x1.');
  wallGeometry.useGeo([{"right":1},{"down":1},{"left":1},{"up":1}]);
}

if (flags.screen_width) {
  var xscale = flags.screen_width;
  var yscale = xscale * 1080 / 1920;
  wallGeometry.setScale(xscale, yscale);
}

process.on('unhandledRejection', (reason, p) => {
  debug('Unhandled rejection: ', p);
  debug(reason);
});

var playlistLoader = new PlaylistLoader(flags);
var playlist = playlistLoader.getInitialPlaylist();
if (playlist.length === 0) {
  throw new Error('Nothing to play!');
}

var app = webapp.create(flags);

const layoutSM = new LayoutStateMachine;
var control = new Control(layoutSM, playlistLoader);
control.installHandlers(app);

game.init(flags);

if (flags.credential_dir) {
  credentials.loadFromDir(flags.credential_dir);
}

var server;
var listener = function() {
  var host = server.address().address;
  var port = server.address().port;

  debug('Server listening at http://%s:%s', host, port);
};

if (flags.use_https) {
  const opts = {
    key: fs.readFileSync('certs/server_key.pem'),
    cert: fs.readFileSync('certs/server_cert.pem'),
    requestCert: flags.require_client_cert,
    ca: [fs.readFileSync('certs/server_cert.pem')]
  };

  server = https.createServer(opts, app).listen(flags.port, listener);
} else {
  server = app.listen(flags.port, listener);
}

var peerServer = new PeerServer({port: flags.port + 6000, path: '/peerjs'});
peerServer.on('connection', function(id) {
  debug('peer connection!', id);
});
peerServer.on('disconnect', function(id) {
  debug('peer disconnect!', id);
});

network.openWebSocket(server);

network.on('new-client', function(client) {
  layoutSM.newClient(client);
});

network.on('lost-client', function(id) {
  layoutSM.dropClient(id);
});

if (flags.enable_monitoring) {
  monitor.enable();
}

debug('Running playlist of ' + playlist.length + ' items');
playlistDriver.driveStateMachine(playlist, layoutSM);
