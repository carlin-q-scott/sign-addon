import {beforeEach, describe, it} from "mocha";
import path from "path";
import {expect} from "chai";
import sinon from "sinon";
import when from "when";

import {submitAddonAndExit} from "../src";

const testDir = path.resolve(__dirname);
const fixturePath = path.join(testDir, "fixtures");


describe("submit", function() {
  var mockProcessExit;
  var mockProcess;
  var submittingCall;
  var fakeClientContructor;

  beforeEach(function() {
    submittingCall = null;
    mockProcessExit = sinon.spy(() => {});
    mockProcess = {
      exit: mockProcessExit,
    };
    fakeClientContructor = sinon.spy(() => {});
  });

  function makeAMOClientStub(options) {
    options = {
      errorToThrow: null,
      result: {success: true},
      ...options,
    };

    function FakeAMOClient() {
      var constructor = fakeClientContructor;
      constructor.apply(constructor, arguments);
      this.debug = function() {};
    }

    submittingCall = sinon.spy(() => when.promise((resolve) => {
      if (options.errorToThrow) {
        throw options.errorToThrow;
      }
      resolve(options.result);
    }));
    FakeAMOClient.prototype.submit = submittingCall;

    return FakeAMOClient;
  }

  function runSignCmd(options) {
    options = {
      throwError: true,
      StubAMOClient: makeAMOClientStub(),
      cmdOptions: {},
      ...options,
    };

    var cmdOptions = {
      apiKey: "some-key",
      apiSecret: "some-secret",
      id: "some-addon@somewhere",
      xpiPath: path.join(fixturePath, "simple-addon.xpi"),
      version: "0.0.1",
      verbose: false,
      AMOClient: options.StubAMOClient,
      ...options.cmdOptions,
    };

    var cmdConfig = {
      systemProcess: mockProcess,
      throwError: options.throwError,
    };

    return submitAddonAndExit(cmdOptions, cmdConfig);
  }

  it("should exit 0 on submitting success", () => {
    return runSignCmd({throwError: false}).then(function() {
      expect(submittingCall.called).to.be.equal(true);
      expect(mockProcessExit.firstCall.args[0]).to.be.equal(0);
    });
  });

  it("passes id/version to the signer", () => {
    return runSignCmd({
      cmdOptions: {
        id: "@simple-addon",
        version: "1.0.0",
      },
    }).then(function() {
      expect(submittingCall.called).to.be.equal(true);
      expect(submittingCall.firstCall.args[0].version).to.be.equal("1.0.0");
      expect(submittingCall.firstCall.args[0].guid)
        .to.be.equal("@simple-addon");
    });
  });

  it("passes release channel to the signer", () => {
    const channel = "listed";
    return runSignCmd({
      cmdOptions: {channel},
    }).then(function() {
      expect(submittingCall.called).to.be.equal(true);
      expect(submittingCall.firstCall.args[0].channel).to.be.equal(channel);
    });
  });

  it("passes JWT expiration to the submitting client", () => {
    const expiresIn = 60 * 15; // 15 minutes
    return runSignCmd({
      cmdOptions: {
        apiJwtExpiresIn: expiresIn,
      },
    }).then(() => {
      expect(fakeClientContructor.firstCall.args[0].apiJwtExpiresIn)
        .to.be.equal(expiresIn);
    });
  });

  it("throws an error for XPI file errors", () => {
    return runSignCmd({
      throwError: false,
      cmdOptions: {
        xpiPath: "/not/a/real/path.xpi",
      },
    }).then(function() {
      expect(mockProcessExit.firstCall.args[0]).to.be.equal(1);
    });
  });

  it("can turn on debug logging", () => {
    return runSignCmd({
      cmdOptions: {
        verbose: true,
      },
    }).then(function() {
      expect(fakeClientContructor.firstCall.args[0].debugLogging)
        .to.be.equal(true);
    });
  });

  it("can configure an API proxy", () => {
    const apiProxy = "http://yourproxy:6000";
    return runSignCmd({
      cmdOptions: {apiProxy},
    }).then(function() {
      expect(fakeClientContructor.firstCall.args[0].proxyServer)
        .to.be.equal(apiProxy);
    });
  });

  it("can configure an API request", () => {
    const apiRequestConfig = {tunnel: true};
    return runSignCmd({
      cmdOptions: {apiRequestConfig},
    }).then(function() {
      expect(fakeClientContructor.firstCall.args[0].requestConfig)
        .to.be.deep.equal(apiRequestConfig);
    });
  });

  it("passes custom XPI to the signer", () => {
    let xpiPath = path.join(fixturePath, "simple-addon.xpi");
    return runSignCmd({
      cmdOptions: {
        id: "some-id",
        version: "0.0.1",
        xpiPath: xpiPath,
      },
    }).then(function() {
      expect(submittingCall.called).to.be.equal(true);
      expect(submittingCall.firstCall.args[0].xpiPath).to.be.equal(xpiPath);
    });
  });

  it("should exit 1 on submitting failure", () => {
    return runSignCmd({
      throwError: false,
      StubAMOClient: makeAMOClientStub({
        result: {success: false},
      }),
    }).then(function() {
      expect(mockProcessExit.firstCall.args[0]).to.be.equal(1);
    });
  });

  it("should exit 1 on exception", () => {
    return runSignCmd({
      StubAMOClient: makeAMOClientStub({
        errorToThrow: new Error("some submitting error"),
      }),
      throwError: false,
    }).then(function() {
      expect(mockProcessExit.firstCall.args[0]).to.be.equal(1);
    });
  });

  it("should allow an empty id", () => {
    return runSignCmd({
      cmdOptions: {
        id: null,
        version: "0.0.1",
      },
    }).then(() => {
      expect(submittingCall.called).to.be.equal(true);
      expect(submittingCall.firstCall.args[0].guid).to.be.null;
    });
  });

  it("should throw error when version is empty", () => {
    return runSignCmd({
      cmdOptions: {
        id: "some-addon@somewhere",
        version: null,
      },
    }).then(() => {
      throw new Error("unexpected success");
    }).catch((error) => {
      expect(error.message).to.match(/argument was empty: version/);
    });
  });

  it("should throw error when xpiPath is empty", () => {
    return runSignCmd({
      cmdOptions: {
        xpiPath: null,
      },
    }).then(() => {
      throw new Error("unexpected success");
    }).catch((error) => {
      expect(error.message).to.match(/argument was empty: xpiPath/);
    });
  });

  it("should throw error when apiKey is empty", () => {
    return runSignCmd({
      cmdOptions: {
        apiKey: null,
      },
    }).then(() => {
      throw new Error("unexpected success");
    }).catch((error) => {
      expect(error.message).to.match(/argument was empty: apiKey/);
    });
  });

  it("should throw error when apiSecret is empty", () => {
    return runSignCmd({
      cmdOptions: {
        apiSecret: null,
      },
    }).then(() => {
      throw new Error("unexpected success");
    }).catch((error) => {
      expect(error.message).to.match(/argument was empty: apiSecret/);
    });
  });

});
