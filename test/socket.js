const expect = require("expect.js");
const { Socket } = require("../");
const { isIE11, isAndroid, isEdge, isIPad } = require("./support/env");
const FakeTimers = require("@sinonjs/fake-timers");
const { repeat } = require("./util");

describe("Socket", function() {
  this.timeout(10000);

  describe("filterUpgrades", () => {
    it("should return only available transports", () => {
      const socket = new Socket({ transports: ["polling"] });
      expect(socket.filterUpgrades(["polling", "websocket"])).to.eql([
        "polling"
      ]);
      socket.close();
    });
  });

  it("throws an error when no transports are available", done => {
    const socket = new Socket({ transports: [] });
    let errorMessage = "";
    socket.on("error", error => {
      errorMessage = error;
    });
    socket.open();
    setTimeout(() => {
      expect(errorMessage).to.be("No transports available");
      socket.close();
      done();
    });
  });

  describe("fake timers", function() {
    before(function() {
      if (isIE11 || isAndroid || isEdge || isIPad) {
        this.skip();
      }
    });

    it("uses window timeout by default", done => {
      const clock = FakeTimers.install();
      const socket = new Socket({ transports: [] });
      let errorMessage = "";
      socket.on("error", error => {
        errorMessage = error;
      });
      socket.open();
      clock.tick(1); // Should trigger error emit.
      expect(errorMessage).to.be("No transports available");
      clock.uninstall();
      socket.close();
      done();
    });

    it.skip("uses custom timeout when provided", done => {
      const clock = FakeTimers.install();
      const socket = new Socket({
        transports: [],
        useNativeTimers: true
      });

      let errorMessage = "";
      socket.on("error", error => {
        errorMessage = error;
      });
      socket.open();
      // Socket should not use the mocked clock, so this should have no side
      // effects.
      clock.tick(1);
      expect(errorMessage).to.be("");
      clock.uninstall();

      setTimeout(() => {
        try {
          expect(errorMessage).to.be("No transports available");
          socket.close();
          done();
        } finally {
        }
      }, 1);
    });
  });

  describe("close", () => {
    it("provides details when maxHttpBufferSize is reached (polling)", done => {
      const socket = new Socket({ transports: ["polling"] });
      socket.on("open", () => {
        socket.send(repeat("a", 101)); // over the maxHttpBufferSize value of the server
      });

      socket.on("error", err => {
        expect(err).to.be.an(Error);
        expect(err.type).to.eql("TransportError");
        expect(err.message).to.eql("xhr post error");
        expect(err.description).to.eql(413);
        // err.context is a XMLHttpRequest object
        expect(err.context.readyState).to.eql(4);
        expect(err.context.responseText).to.eql("");
      });

      socket.on("close", (reason, details) => {
        expect(reason).to.eql("transport error");
        expect(details).to.be.an(Error);
        done();
      });
    });

    it("provides details when maxHttpBufferSize is reached (websocket)", done => {
      const socket = new Socket({ transports: ["websocket"] });
      socket.on("open", () => {
        socket.send(repeat("a", 101)); // over the maxHttpBufferSize value of the server
      });

      socket.on("close", (reason, details) => {
        if (isIE11) {
          expect(reason).to.eql("transport error");
          expect(details).to.be.an(Error);
        } else {
          expect(reason).to.eql("transport close");
          expect(details.description).to.eql("websocket connection closed");
          // details.context is a CloseEvent object
          expect(details.context.code).to.eql(1009); // "Message Too Big" (see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code)
          expect(details.context.reason).to.eql("");
          // note: details.context.wasClean is false in the browser, but true in Node.js
        }
        done();
      });
    });

    it("provides details when the session ID is unknown (polling)", done => {
      const socket = new Socket({
        transports: ["polling"],
        query: { sid: "abc" }
      });

      socket.on("error", err => {
        expect(err).to.be.an(Error);
        expect(err.type).to.eql("TransportError");
        expect(err.message).to.eql("xhr poll error");
        expect(err.description).to.eql(400);
        // err.context is a XMLHttpRequest object
        expect(err.context.readyState).to.eql(4);
        expect(err.context.responseText).to.eql(
          '{"code":1,"message":"Session ID unknown"}'
        );
      });

      socket.on("close", (reason, details) => {
        expect(reason).to.eql("transport error");
        expect(details).to.be.an(Error);
        done();
      });
    });

    it("provides details when the session ID is unknown (websocket)", done => {
      const socket = new Socket({
        transports: ["websocket"],
        query: { sid: "abc" }
      });

      socket.on("error", err => {
        expect(err).to.be.an(Error);
        expect(err.type).to.eql("TransportError");
        expect(err.message).to.eql("websocket error");
        // err.description is a generic Event
        expect(err.description.type).to.be("error");
      });

      socket.on("close", (reason, details) => {
        expect(reason).to.eql("transport error");
        expect(details).to.be.an(Error);
        done();
      });
    });
  });
});
