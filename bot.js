//
// This is main file containing code implementing the Express server and functionality for the Express echo bot.
//
'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const path = require('path');
const jsforce = require('jsforce');
const apiai = require('apiai');

var messengerButton = "<html><head><title>Facebook Messenger Bot</title></head><body><h1>Facebook Messenger Bot</h1>This is a bot based on Messenger Platform QuickStart. For more details, see their <a href=\"https://developers.facebook.com/docs/messenger-platform/guides/quick-start\">docs</a>.<script src=\"https://button.glitch.me/button.js\" data-style=\"glitch\"></script><div class=\"glitchButton\" style=\"position:fixed;top:20px;right:20px;\"></div></body></html>";

var apiaiApp = apiai("442a21d0ee334db2b8127877a61cc929");



var conn = new jsforce.Connection();
conn.login(process.env.SALESFORCE_USERNAME, process.env.SALESFORCE_PASSWORD, function(err, res) {
  if (err) { return console.error(err); }
});

var claimInfo = {
  IDO_W_POLICY__c : 'a4P1I000000TSV7UAO',
  IDO_W_POLICYHOLDER__c: '0011I000005mhxZQAQ',
  IDO_Claim_Sub_Type__c: 'Property Damage',
  IDO_W_CLAIM_DESCRIPTION__c: null,
  IDO_W_PICTURE: null
};
var newClaimInfo = {
  BusinessHoursId : '01m1J0000000DyZQAU',
  ContactId: '0031J00001HmoGbQAJ',
  CSAT__c: '5.0',
  Description: null,
  Picture: null,
  First_Contact_Close__c: false,
  Injuries_or_Multi_Car_Collision__c: false,
  Priority: 'High',
  ProductId: '01t1J00000AbonWQAR',
  RecordTypeId: '0121J0000012wnKQAQ',
  Send_Email_Trigger__c: false,
  SLA_Compliant__c: true,
  Status: 'New',
  Subject: 'Forcezilla has attacked the apartment',
  Sub_Type__c: 'Order or Invoice',
  Type: 'Account Support',
  Type_of_Support__c: 'Standard',
}
var usersState = {
};

// The rest of the code implements the routes for our Express server.
let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

// Webhook validation
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }
});

// Display the web page
app.get('/', function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(messengerButton);
  res.end();
});

app.post('/sendMessageFromSalesforce', function(req, res) {
  
});

// Message processing
app.post('/webhook', function (req, res) {
  console.log(req.body);
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {
    
    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);   
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});

// Incoming events handling
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  
  /*if(usersState[senderID] == null){
    usersState[senderID] = {
      state: 'receivedText'
    }
  }*/

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if((messageText || messageAttachments) && usersState[senderID] != null){
    createClaimInSalesforce(senderID, messageText, messageAttachments);
  } else {
    if (messageText) {
      // If we receive a text message, check to see if it matches a keyword
      // and send back the template example. Otherwise, just echo the text we received.

        switch (messageText) {
          case 'generic':
            sendGenericMessage(senderID);
            break;

          case 'case create':
            sendCreateCaseRequest(senderID);
            break;

          default:
            sendTextMessageThruApiAi(senderID, messageText);
        }

    } else if (messageAttachments) {
      sendTextMessage(senderID, "Message with attachment received");
    }
  }
}

function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  //if(usersState[senderID] == null){
    //usersState[senderID] = {
      //state: 'receivedPostback'
    //}
  //}

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  if(payload){
    switch(payload) { 
      case 'Payload for No': 
        sendTextMessage(senderID, payload);
        break;
      case 'Payload for Yes':
        createClaimInSalesforce(senderID);
        //sendTextMessage(senderID, payload);
        break;
      default:
        sendTextMessage(senderID, payload);
    }
  }
  //sendTextMessage(senderID, "Postback called");
}


function createClaimInSalesforce(senderID, messageText, messageAttachments) {
  if(usersState[senderID] == null){
    usersState[senderID] = JSON.parse(JSON.stringify(newClaimInfo));
  }
  
  if(usersState[senderID].Description == null){
      sendTextMessage(senderID, "Thank you, Mr. Lego Man. Can you please describe the state of the apartment?");
      usersState[senderID].Description = "waiting on text";
  } else if (usersState[senderID].Picture == null){
    console.log('storing description on claim:' + messageText);
    usersState[senderID].Description = messageText;
    sendTextMessage(senderID, "I'm so sorry to hear that. Can you take a picture of the situation and send it over?");
    usersState[senderID].Picture = "waiting on picture";
  } else {
    console.log('storing picture on claim:' + messageAttachments[0].payload.url);
    usersState[senderID].Picture = messageAttachments[0].payload.url;
    sendTextMessage(senderID, "Thank you for giving the necessary information, Mr. Lego Man. I have created a claim for you and we will be continously tracking this. Stay safe and thank you for choosing, Lego Metropolis Insurance.");
    var currUserState = usersState[senderID];
    var dataBlob = JSON.parse(JSON.stringify(currUserState));
    dataBlob.Description = dataBlob.Description + " " + dataBlob.Picture;
    delete dataBlob["Picture"];
    conn.sobject("Case").create(dataBlob, function(err, ret){
      if(err || !ret.success){ return console.error(err, ret);}
      usersState[senderID] = null;
       console.log("Created a service request.");
    })
  }
  // conn.sobject("Claims__c").create(
  //   { 
  //     IDO_W_POLICY__c : 'PN-00076',
  //     IDO_W_POLICY__c: '0011I000005mhxZQAQ',
  //     IDO_Claim_Sub_Type__c: 'Property Damage',
  //     I
  //   }, function(err, ret) {
  //     if (err || !ret.success) { return console.error(err, ret); }
  //     console.log("Created record id : " + ret.id);
  //   });
}

//////////////////////////
// Sending helpers
//////////////////////////
function sendTextMessage(recipientId, messageText) {
  
  
//   var apiaiReq = apiaiApp.textRequest(messageText, {
//       sessionId: recipientId
//   });

//   apiaiReq.on('response', function(response) {
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
    
     callSendAPI(messageData);
      // console.log(response.result.fulfillment);
  // });

//   apiaiReq.on('error', function(error) {
//       console.log(error);
//   });
  
//   apiaiReq.end();
  
}

function sendTextMessageThruApiAi(recipientId, messageText) {
  
  
  var apiaiReq = apiaiApp.textRequest(messageText, {
      sessionId: recipientId
  });

  apiaiReq.on('response', function(response) {
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: response.result.fulfillment.speech
    }
  };
    
     callSendAPI(messageData);
      // console.log(response.result.fulfillment);
  });

  apiaiReq.on('error', function(error) {
      console.log(error);
  });
  
  apiaiReq.end();
  
}

function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Are you sure you want to file a case?",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",               
            image_url: "http://messengerdemo.parseapp.com/img/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",               
            image_url: "http://messengerdemo.parseapp.com/img/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

function sendCreateCaseRequest(recipientId){
   var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Mr. Lego Man, we detected a disturbance. Forcezilla is attacking your apartment!",
            subtitle: "Can you get to your apartment to file a claim?",
            item_url: "",               
            image_url: "http://tarstarkas.net/pics/movies/g/gmk12.jpg",
            buttons: [{
              type: "postback",
              payload: "Payload for Yes",
              title: "Yes"
            }, {
              type: "postback",
              title: "No",
              payload: "Payload for No",
            }],
          }]
        }
      }

    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});