/* Study 3 adapter: requires the matching rebuilt Unity Study3 bridge.
 * Loaded before the Unity loader. The game registers its actual receiver.
 * Ready means Unity accepted the assignment, not merely that SendMessage ran.
 */
(function () {
  "use strict";
  var allowedParentOrigins = ["https://ubc.yul1.qualtrics.com"];
  var engine, target, method, config, parentOrigin, deliveredToken;
  var accepted = false, queued = false, completionSent = false, saved = false;
  function send(data) { window.parent.postMessage(data, parentOrigin); }
  function apply() {
    if (queued || !engine || !target || !method || !config || deliveredToken) return;
    queued = true;
    // Avoid calling back into managed code inside Listen's C# -> JS stack.
    Promise.resolve().then(function () {
      queued = false;
      if (deliveredToken || !engine || !target || !config) return;
      deliveredToken = config.sessionToken;
      engine.SendMessage(target, method, JSON.stringify(config));
    });
  }
  function valid(data) {
    return data && data.type === "study3_init" && data.version === "1.0"
      && typeof data.sessionToken === "string" && /^[a-f0-9]{32}$/.test(data.sessionToken)
      && ["no_information","anonymous_information","named_information"].indexOf(data.condition) !== -1
      && Number.isInteger(data.orderId) && data.orderId >= 1 && data.orderId <= 10
      && Array.isArray(data.trialOrder) && data.trialOrder.length === 10
      && new Set(data.trialOrder).size === 10
      && data.trialOrder.every(function(id){return /^S3_(0[1-9]|10)$/.test(id);})
      && data.probabilitySumRule === "sum100" && data.showOdds === true
      && data.startingCredits === 5000 && data.bonusCapGBP === 2.5;
  }
  window.addEventListener("message", function(event) {
    if (event.source !== window.parent || allowedParentOrigins.indexOf(event.origin) === -1) return;
    var data = event.data;
    if (!data || data.version !== "1.0") return;
    if (data.type === "study3_init") {
      if (config || !valid(data)) return;
      config = JSON.parse(JSON.stringify(data)); parentOrigin = event.origin; apply();
    } else if (data.type === "study3_saved" && accepted && completionSent && !saved
               && data.sessionToken === config.sessionToken) {
      saved = true;
      engine.SendMessage(target, "OnQualtricsAccepted", "1");
    }
  });
  window.Study3Bridge = {
    attach: function(unityInstance) {
      if (!unityInstance || typeof unityInstance.SendMessage !== "function") throw new Error("Supply the real Unity instance.");
      if (engine && engine !== unityInstance) throw new Error("Unity instance is already attached.");
      engine = unityInstance; apply();
    },
    registerReceiver: function(gameObjectName, receiveMethodName) {
      if (!gameObjectName || !receiveMethodName) throw new Error("Unity must register its actual receiver.");
      if (target && (target !== gameObjectName || method !== receiveMethodName)) throw new Error("Study 3 receiver cannot change.");
      target = gameObjectName; method = receiveMethodName; apply();
    },
    assignmentResult: function(sessionToken, ok, error) {
      if (!config || deliveredToken !== sessionToken || config.sessionToken !== sessionToken || accepted) return;
      if (ok === true) {
        accepted = true;
        send({type:"study3_ready",version:"1.0",sessionToken:sessionToken});
      } else {
        console.error("[Study3] Unity rejected assignment: " + String(error || "Unknown configuration error").slice(0,200));
        send({type:"study3_error",version:"1.0",sessionToken:sessionToken,error:"assignment_rejected"});
      }
    },
    complete: function(trials) {
      if (!accepted || !Array.isArray(trials) || trials.length !== 10) throw new Error("Unity must accept the assignment and supply ten trial records.");
      completionSent = true;
      send({type:"study3_complete",version:"1.0",sessionToken:config.sessionToken,condition:config.condition,orderId:config.orderId,trials:trials});
    }
  };
}());
