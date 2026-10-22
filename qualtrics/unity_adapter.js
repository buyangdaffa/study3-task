/* Include in the UPDATED Unity WebGL index page, not in Qualtrics.
 * Attach the real Unity instance after createUnityInstance resolves.
 * This adapter does not implement the betting task or historical playback. */
(function () {
  "use strict";
  var allowedParentOrigins = ["https://ubc.yul1.qualtrics.com"];
  // This adapter owns inbound messages on the dedicated production page.
  // The inspected compiled Study3ListenForParent uses this same guard.
  // Set it BEFORE Unity loads, preventing a second, less strict listener.
  window.__study3ParentBound = true;
  var engine, config, parentOrigin, target, method, appliedToken;
  function apply() {
    if (!engine || !config || appliedToken === config.sessionToken) return;
    engine.SendMessage(target, method, JSON.stringify(config));
    appliedToken = config.sessionToken;
    window.parent.postMessage({type:"study3_ready",version:"1.0",sessionToken:config.sessionToken},parentOrigin);
  }
  window.addEventListener("message",function (event) {
    if (event.source !== window.parent || allowedParentOrigins.indexOf(event.origin) === -1) return;
    var data = event.data;
    if (!data || data.version !== "1.0") return;
    if (data.type === "study3_init" && typeof data.sessionToken === "string" && /^[a-f0-9]{32}$/.test(data.sessionToken)) {
      if (["no_information","anonymous_information","named_information"].indexOf(data.condition) === -1 ||
          !Number.isInteger(data.orderId) || data.orderId < 1 || data.orderId > 10 ||
          !Array.isArray(data.trialOrder) || data.trialOrder.length !== 10 ||
          new Set(data.trialOrder).size !== 10 ||
          !data.trialOrder.every(function(id){ return /^S3_(0[1-9]|10)$/.test(id); }) ||
          data.probabilitySumRule !== "sum100" || data.showOdds !== true) return;
      // Repeated init messages are idempotent; never restart a running task.
      if (config) return;
      config = data; parentOrigin = event.origin; apply();
    }
    if (data.type === "study3_saved" && config && data.sessionToken === config.sessionToken && engine && appliedToken === config.sessionToken) {
      engine.SendMessage(target,"OnQualtricsAccepted","1");
    }
  });
  window.Study3Bridge = {
    attach:function (unityInstance,gameObjectName,receiveMethodName) {
      if (!unityInstance || !gameObjectName || !receiveMethodName) throw new Error("Supply the real Unity instance, GameObject and config method.");
      engine=unityInstance;target=gameObjectName;method=receiveMethodName;apply();
    },
    complete:function (trials) {
      if (!config || !parentOrigin || appliedToken !== config.sessionToken || !Array.isArray(trials) || trials.length !== 10) throw new Error("Study 3 initialization and ten records are required.");
      window.parent.postMessage({type:"study3_complete",version:"1.0",sessionToken:config.sessionToken,condition:config.condition,orderId:config.orderId,trials:trials},parentOrigin);
    }
  };
}());
