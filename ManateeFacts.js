// dependencies
var AWS = require('aws-sdk'),
  dynamoDB = new AWS.DynamoDB(),
  doc = require('dynamodb-doc'),
  dynamo = new doc.DynamoDB();



// globals
var tableName = 'ManateeFacts',
  qs = require('querystring'),
  user = '',
  slack = '',
  factsArray = [],
  currentFact = {},
  currentFactId = 0,
  currentTime = Date.now(),
  lastUsedTime = 0,
  i = 0,
  params = {};


// settings
var resetTime = 100000, // 10 minutes
  action = '';


var getUpdateParams = function(factId, column, value) {
  return {
    TableName: tableName,
    Key: {
      ID: Number(factId)
    },
    UpdateExpression: "set " + column + " = :v1",
    ExpressionAttributeValues: {
      ":v1": value
    }

  };
};

var getPutParams = function(factId, value) {
  return {
    TableName: tableName,
    Item: {
      ID: Number(factId),
      Fact: value,
      lastUsed: currentTime
    }
  };
};


var getRandomFact = function(facts, t) {

  i = Math.floor((Math.random() * facts.length - 1) + 1);

  currentFact = facts[i];
  lastUsedTime = currentFact.lastUsed.N || 0;

  // if item has been used in the last t ms search for a new fact
  if ((currentTime - lastUsedTime) < t) {
    console.log('hit');
    // remove current fact from facts array
    facts.splice(i, 1);

    if (facts.length > 1) {
      // search for a new fact as long as this isn't the last one
      return getRandomFact(facts, t);
    } else {
      return null
    }
  }

  return currentFact;
};

var parseAction = function(action) {
  if (action.indexOf(' ') > -1) {
    return {
      do: action.substr(0, action.indexOf(' ')),
      param: action.substr(action.indexOf(' ') + 1)
    };
  } else return {
    do: action,
    param: null
  }
};

function getBombString(facts, amount) {
    var arr = [];
    if (amount < 2) {
        // return one random fact
        return getRandomFact(facts,0).Fact.S;
    } else {
        for(var i = 0; i < amount; i++) {
            randomFactIndex = Math.floor((Math.random() * facts.length - 1) + 1);
            arr.push(i+1 + ') ' + facts[randomFactIndex].Fact.S);
            facts.splice(randomFactIndex, 1);
        }
        return arr.join('\n\n')
    }
}


/* --- Handler Definition ---*/

exports.handler = function(event, context) {
  slack = qs.parse(event.postBody);
  action = slack.text ? parseAction(slack.text) : {};
  user = slack.user_name;

  dynamoDB.scan({
    TableName: tableName
  }, function(err, data) {
    if (err) {
      context.done('error', 'reading dynamodb failed: ' + err);
    }

    factsArray = data.Items;

    // ***************
    // Add action
    // ***************
    if (action.do == 'add') {
      // get params for call to updateItem

      if (user.toLowerCase() == 'mike') {
        params = getPutParams(factsArray.length, action.param);

        dynamo.putItem(params, function(err, data) {

          if (err) {
            return console.log(err);
          }
          console.log("success");

          /* ---- Respond with success message ----*/
          context.done(null, {
            "text": 'successfully added ' + action.param
          });
        });
        return;

      } else {
        /* ---- Respond with user rejected message ----*/
        context.done(null, {
          "response_type": "in_channel",
          "text": "You are not the master of the manatee facts! For shame!!!"
        });
        return;
      }

    }
    
    
    // ***************
    // Bomb action
    // ***************
    
    var bombString = '';
    if (action.do == 'bomb') {
        // if no param specified show a random amount
        action.param = action.param || Math.floor((Math.random() * factsArray.length - 1) + 1);
        
        bombString = getBombString(factsArray,action.param);
 
       /* ---- Respond with bomb string ----*/
      context.done(null, {
        "response_type": "in_channel",
        "text": bombString
      });      
    }
    
    
    
    // ***************
    // Default action
    // ***************
    
    currentFact = getRandomFact(factsArray, resetTime);

    if (!currentFact) {

      /* ---- Respond with sorry message ----*/
      context.done(null, {
        "response_type": "in_channel",
        "text": "You've learned all there is to know about manatees for now. Yippeeeeee!"
      });


    } else {

      // get params for call to updateItem
      params = getUpdateParams(currentFact.ID.N, 'lastUsed', currentTime);

      dynamo.updateItem(params, function(err, data) {

        if (err) {
          return console.log(err);
        }
        console.log("success");

        /* ---- Respond with fact ----*/
        context.done(null, {
          "response_type": "in_channel",
          "text": currentFact.Fact.S
        });
      });
    }

  });
};
