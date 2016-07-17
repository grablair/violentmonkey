define('views/Confirm', function (require, _exports, module) {
  var Editor = require('views/Editor');
  var cache = require('cache');

  module.exports = {
    props: ['params'],
    components: {
      Editor: Editor,
    },
    template: cache.get('/options/components/confirm.html'),
    data: function () {
      return {
        installable: false,
        message: '',
        code: '',
        require: {},
        resources: {},
        dependencyOK: false,
      };
    },
    computed: {
      isLocal: function () {
        return /^file:\/\/\//.test(this.params.url);
      },
    },
    ready: function () {
      var _this = this;
      _this.message = _.i18n('msgLoadingData');
      _this.loadData().then(function () {
        _this.parseMeta();
      });
    },
    methods: {
      loadData: function (changedOnly) {
        var _this = this;
        _this.installable = false;
        var oldCode = _this.code;
        return _this.getScript(_this.params.url)
        .then(function (code) {
          if (changedOnly && oldCode === code) return Promise.reject();
          _this.code = code;
        })
      },
      parseMeta: function () {
        var _this = this;
        return _.sendMessage({
          cmd: 'ParseMeta',
          data: _this.code,
        })
        .then(function (script) {
          var urls = _.values(script.resources);
          var length = script.require.length + urls.length;
          if (!length) return;
          var finished = 0;
          var error = [];
          var updateStatus = function () {
            _this.message = _.i18n('msgLoadingDependency', [finished, length]);
          };
          updateStatus();
          var promises = script.require.map(function (url) {
            return _this.getFile(url).then(function (res) {
              _this.require[url] = res;
            });
          });
          promises = promises.concat(urls.map(function (url) {
            return _this.getFile(url, true).then(function (res) {
              _this.resources[url] = res;
            });
          }));
          promises = promises.map(function (promise) {
            return promise.then(function () {
              finished += 1;
              updateStatus();
            }, function (url) {
              error.push(url);
            });
          });
          return Promise.all(promises).then(function () {
            if (error.length) return Promise.reject(error.join('\n'));
            _this.dependencyOK = true;
          });
        })
        .then(function () {
          _this.message = _.i18n('msgLoadedData');
          _this.installable = true;
        }, function (err) {
          _this.message = _.i18n('msgErrorLoadingDependency', [err]);
          return Promise.reject();
        });
      },
      close: function () {
        window.close();
      },
      getFile: function (url, isBlob) {
        return new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest;
          xhr.open('GET', url, true);
          if (isBlob) xhr.responseType = 'blob';
          xhr.onloadend = function () {
            if (xhr.status > 300) return reject(url);
            if (isBlob) {
              var reader = new FileReader;
              reader.onload = function () {
                resolve(window.btoa(this.result));
              };
              reader.readAsBinaryString(xhr.response);
            } else {
              resolve(xhr.responseText);
            }
          };
          xhr.send();
        });
      },
      getScript: function (url) {
        var _this = this;
        return _.sendMessage({
          cmd: 'GetFromCache',
          data: url,
        })
        .then(function (text) {
          return text || Promise.reject();
        })
        .catch(function () {
          return _this.getFile(url);
        })
        .catch(function (url) {
          _this.message = _.i18n('msgErrorLoadingData');
          throw url;
        });
      },
      getTimeString: function () {
        var now = new Date;
        return _.zfill(now.getHours(), 2) + ':' +
        _.zfill(now.getMinutes(), 2) + ':' +
        _.zfill(now.getSeconds(), 2);
      },
      installScript: function () {
        var _this = this;
        _this.installable = false;
        _.sendMessage({
          cmd:'ParseScript',
          data:{
            url: _this.params.url,
            from: _this.params.referer,
            code: _this.code,
            require: _this.require,
            resources: _this.resources,
          },
        })
        .then(function (res) {
          _this.message = res.message + '[' + _this.getTimeString() + ']';
          if (res.code < 0) return;
          if (_.options.get('closeAfterInstall')) _this.close();
          else if (_this.isLocal && _.options.get('trackLocalFile')) _this.trackLocalFile();
        });
      },
      trackLocalFile: function () {
        var _this = this;
        new Promise(function (resolve) {
          setTimeout(resolve, 2000);
        })
        .then(function () {
          return _this.loadData(true).then(function () {
            return _this.parseMeta();
          });
        })
        .then(function () {
          var track = _.options.get('trackLocalFile');
          track && _this.installScript();
        }, function () {
          _this.trackLocalFile();
        });
      },
    },
  };
});
