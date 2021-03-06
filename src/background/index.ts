/*global chrome*/
import { createStore } from 'redux';
import rootReducer from './reducers';
import Segment from './utils/segment';

import { wrapStore } from 'webext-redux';

import agent from './agent';
import { verbWords, objectWords, getDataUri } from './utils/activity';

import * as logo from './assets/img/logo_icon.png';
import * as logo_long from './assets/img/logo_long.png';

declare global {
  interface Window { analytics: any }
}

const rootUrl = process.env.NODE_ENV === 'production' ? 'https://www.analogue.app' : 'http://localhost:3000'

const store = createStore(rootReducer, {})

var stream = require('getstream');

Segment.load('5misG1vVKILgvkxtM7suBhUouTZBxbJ5')

const injectContentScript = (message = null) => {
  // first, query to see if content script already exists in active tab
  // https://stackoverflow.com/a/42377997
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];

    chrome.tabs.sendMessage(activeTab.id, { message: "content_script_loaded?" }, (msg) => {

      if (chrome.runtime.lastError) {
        // programatically inject content script to active tab
        // this gets triggered when content_script doesn't exist on page
        // https://stackoverflow.com/questions/51732125/using-activetab-permissions-vs-all-urls
        // https://developer.chrome.com/extensions/content_scripts#programmatic
        // chrome.tabs.insertCSS(activeTab.id, { file: "css/all.css" })
        chrome.tabs.executeScript(activeTab.id, { file: "js/all.js", runAt: "document_end" }, () => {
          if (message) {
            chrome.tabs.sendMessage(activeTab.id, message)
          }
        })

        return
      } else {
        // trigger message to the active tab since already injected
        // msg.status === true
        if (message) {
          chrome.tabs.sendMessage(activeTab.id, message)
        }
      }
    })
  })
}

chrome.contextMenus.create({
  title: 'Add to Analogue',
  contexts: ["all"],
  onclick: function(info, tab) {
    // info.selectionText get's selection
    injectContentScript({ message: "clicked_browser_action" })
  }
})

chrome.contextMenus.create({
  title: 'Make note from selection',
  contexts: ["selection"],
  onclick: function(info, tab) {
    const text = info.selectionText
    injectContentScript({ message: "clicked_browser_action", highlight: text})
  }
})

var unreadItemCount = 0;

function setAllRead() {
  chrome.browserAction.setBadgeText({text: ''});   // <-- set text to '' to remove the badge
}

function setUnread(count) {
  unreadItemCount = count;
  chrome.browserAction.setBadgeBackgroundColor({color: "#c7ac75"});
  chrome.browserAction.setBadgeText({text: '' + count});
}

chrome.runtime.onMessageExternal.addListener(
  function(request, sender, sendResponse) {
    if (request) {
        if (request.message) {
            if (request.message == "check_install") {
                sendResponse(true);
            }
        }
    }
});

chrome.browserAction.onClicked.addListener(function() {
  injectContentScript({ message: "clicked_browser_action", activity: true })
})

chrome.commands.onCommand.addListener(function(command) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0]

    getSelectedText(activeTab.id, function(text) {
      localStorage.selectedText = text
      if (text) {
        injectContentScript({ message: "clicked_browser_action", highlight: text })
      }
      else if (activeTab.url.includes("youtube.com/")) {
        getYtTime(activeTab.id, function(time) {
          const minutes = ('0' + Math.floor(time / 60).toString()).slice(-2)
          const seconds = ('0' + Math.floor(time % 60).toString()).slice(-2)
          const timestamp = `${minutes}:${seconds} - `
          const timeLink = `${activeTab.url}&t=${minutes}m${seconds}s`
          injectContentScript({ message: "clicked_browser_action", timestamp: timestamp, url: timeLink})
        })
      }
      else if (activeTab.url.includes("amazon.com/")) {
        getAmazonTime(activeTab.id, function(timeStamp) {
          const timeLink = `${activeTab.url}`
          injectContentScript({ message: "clicked_browser_action", timestamp: timeStamp, url: timeLink})
        })
      }
      else if (activeTab.url.includes("netflix.com/")) {
        getNetflixTime(activeTab.id, function(time) {
          const hours = Math.floor(time / 3600)
          const minutes = ('0' + (Math.floor(time / 60) - 60*hours).toString()).slice(-2)
          const seconds = ('0' + Math.floor(time % 60).toString()).slice(-2)
          const timestamp = `${hours > 0 ? `${hours}:` : ""}${minutes}:${seconds} - `
          const timeLink = `${activeTab.url}&t=${time}`
          injectContentScript({ message: "clicked_browser_action", timestamp: timestamp, url: timeLink})
        })
      }
      else {
        injectContentScript({ message: "clicked_browser_action"})
      }
    })
  })
})

chrome.tabs.onActivated.addListener(function(activeInfo) {
  injectContentScript()
})

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (changeInfo.status === "complete") {
    injectContentScript()
  }
})

// TODO, check analogue auth on startup
// chrome.runtime.onStartup.addListener(() => {
//   console.log('onStartup....')
// })

// middleware, can only listen for external messages in background page:
// https://stackoverflow.com/questions/18835452/chrome-extension-onmessageexternal-undefined
const configureAuth = response => {
  chrome.storage.local.get("analogueJWT", function(token) {
    if (Object.keys(token).length === 0) {
      const user = response.user
      agent.setToken(user.token)
      // connect to realtime updates via stream
      const client = stream.connect(
        user.streamKey,
        user.streamToken,
        user.streamId,
      );

      window.analytics.identify(user.id.toString(), {
        name: user.name,
        email: user.email,
        username: user.username,
        type: user.type
      })

      const notificationFeed = client.feed('notification', user.id.toString())
      notificationFeed.subscribe(streamCallback).then(streamSuccessCallback, streamFailCallback)

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {message: "auth_user_response", body: response });
      })
    }
  })
  injectContentScript({ message: "clicked_browser_action", activity: true })
}

const streamCallback = (data) => {
  // only make data call on new notifications, not delete
  if (data.new && data.new.length > 0) {
    agent.Activity.notify(data.new).then(
      res => {
        const activity = res.activities[0];

        // create notification object from activity
        const title = `${activity.user.name} (@${activity.user.username}) ${activity.activity.notify_owner
                  ? "replied in your note"
                  : `${verbWords[activity.activity.verb]} ${activity.activity.verb === "Mention" ? objectWords["Mention"] : activity.activity.verb === "Add" ? activity.primer.title : objectWords[activity.objectType]}` }`

        const message = activity.response
          ? activity.response.body
          : activity.activity.verb === "Like" && activity.objectType === "Response"
            ? activity.object.body
            : activity.activity.verb === "Like" && activity.objectType === "Knot"
              ? activity.object.bodyText
              : activity.activity.verb === "Add" || activity.activity.verb === "Log" && activity.log && activity.log.content
                ? activity.log.content.title
                : "View their profile on Analogue"

        const notificationUrl = activity.log && activity.log.content
          ? `/${activity.log.content.formSlug}/${activity.log.content.slug}/@${activity.log.user.username}`
          : `/@${activity.user.username}`

        // url is id of notification for onClick anchor
        // ids must be unique to trigger new notifications, so have to add uid to front of URL in case url is the same
        const generatedUid = [...Array(10)].map(i=>(~~(Math.random()*36)).toString(36)).join('')

        // if not follow, fetch data URI of image
        // can only accept dataUri or local resources
        // https://stackoverflow.com/a/44487435
        if (activity.log && activity.log.content && activity.log.content.imageUrl) {
          getDataUri(`${activity.log.content.imageUrl}`, function(dataUri) {
            var options = {
              type: "basic",
              title: title,
              message: message,
              iconUrl: dataUri,
            }

            chrome.notifications.create(generatedUid + rootUrl + notificationUrl, options, (notificationId) => {
              console.log("Last error:", chrome.runtime.lastError)
            })
          })
        } else {
          var options = {
            type: "basic",
            title: title,
            message: message,
            iconUrl: logo,
          }
          chrome.notifications.create(generatedUid + rootUrl + notificationUrl, options, (notificationId) => {
            console.log("Last error:", chrome.runtime.lastError)
          })
        }
      }
    )
  }
}
const streamSuccessCallback = () => console.log('now listening to changes in realtime')
const streamFailCallback = data => console.log('realtime connnection failed', data)

// create a onClick listener for notifications
chrome.notifications.onClicked.addListener((notificationId) => {
  // remove uid from id to get analogue url
  chrome.tabs.create({url: notificationId.substring(10)})
});

function getSelectedText(tabId, cb) {
  chrome.tabs.executeScript(tabId, {
      code: "window.getSelection().toString();",
  }, function(selection) {
      cb(selection[0]);
  });
}

function getYtTime(tabId, cb) {
  chrome.tabs.executeScript(tabId, {
      code: "document.getElementsByClassName('video-stream')[0].currentTime"
  }, function(ytTime) {
      cb(ytTime[0]);
  });
}

function getAmazonTime(tabId, cb) {
  chrome.tabs.executeScript(tabId, {
      code: "document.getElementsByClassName('atvwebplayersdk-timeindicator-text fheif50 f989gul f1s55b4')[0].textContent.substring(0,7)"
  }, function(amazonTime) {
      cb(amazonTime[0]);
  });
}

function getNetflixTime(tabId, cb) {
  chrome.tabs.executeScript(tabId, {
      code: `document.querySelectorAll('[aria-label^="Seek time scrubber"]')[0].ariaValueNow`
  }, function(netflixTime) {
      cb(netflixTime[0]);
  });
}

// for avoid CORB call, use background and communicate with content script
// https://stackoverflow.com/questions/54786635/how-to-avoid-cross-origin-read-blockingcorb-in-a-chrome-web-extension
const messageListener = (request) => {
  if (request.message === "auth_user") {
    agent.Auth.login(request.user).then(
      response => {
        configureAuth(response)
      },
      error => {
        injectContentScript({ message: "incorrect_password" })
      }
    )
  }

  if (request.message === "get_current_user") {
    agent.setToken(request.token)
    agent.Auth.current().then(response => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {
          message: "auth_user_response",
          body: response,
          activity: request.activity,
          goodies: request.goodies
        })
      })
    })
  }

  if (request.message === "get_activity") {
    agent.Activity.notifications().then(response => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {
          message: "get_activity_response",
          body: response
        })
        setUnread(response.activities.filter(
          activityGroup => !activityGroup.activityData.is_read).length
        )
      })
    })
  }

  if (request.message === "read_activity") {
    agent.Activity.read(request.activityData.id).then(response => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {
          message: "read_activity_response",
          body: response
        })
        if (unreadItemCount == 1) setAllRead()
        else setUnread(unreadItemCount - 1)
      })
    })
  }

  if (request.message === "unfollow_profile") {
    agent.Profile.unfollow(request.profile.username).then(response => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {
          message: "unfollow_profile_response",
        })
      })
    })
  }

  if (request.message === "follow_profile") {
    agent.Profile.follow(request.profile.username).then(response => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        chrome.tabs.sendMessage(activeTab.id, {
          message: "follow_profile_response",
        })
      })
    })
  }

  if (request.message === "parse_content") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      window.analytics.track('Extension Clicked')

      // Send a message to the active tab with server response
      agent.Contents.parse(activeTab.url).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "parse_content_response", body: response, goodies: request.goodies });

        if (response.newlyCreated) {
          window.analytics.track('Log Created', {
            id: response.log.id,
            contentId: response.content.id,
            context: 'midas'
          })
        }
      })
    })
  }

  if (request.message === "log_update") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Logs.update(request.log).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "log_update_response", body: response });

        window.analytics.track('Log Updated', {
          id: response.log.id,
          status: response.log.status,
          context: 'midas'
        })
      })
    })
  }

  if (request.message === "delete_log") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      agent.Logs.delete(request.id).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "delete_log_response", body: response });

        window.analytics.track('Log Deleted', {
          id: response.log.id,
          contentId: response.log.contentId,
          context: 'midas'
        })
      })
    })
  }

  if (request.message === "get_knots") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Knots.all(request.log).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "get_knots_response", body: response });
      })
    })
  }

  if (request.message === "create_knot") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Knots.create(request.knot, request.log).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "create_knot_response", body: response });

        window.analytics.track('Knot Created', {
          id: response.id,
          logId: response.logId
        })
      })
    })
  }

  if (request.message === "delete_knot") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Knots.del(request.knot.id).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "delete_knot_response", body: response });

        window.analytics.track('Knot Deleted', {
          id: response.id,
          logId: response.logId
        })
      })
    })
  }

  if (request.message === "edit_knot") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Knots.update(request.knot).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "edit_knot_response", body: response });

        window.analytics.track('Knot Edited', {
          id: response.id,
          logId: response.logId
        })
      })
    })
  }

  if (request.message === "update_knot_likes") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      if (request.liked) {
        agent.Knots.like(request.knot.id).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_knot_likes_response", body: response, like: true });
        })
      } else {
        agent.Knots.unlike(request.knot.id, request.like.id).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_knot_likes_response", body: response, like: false });
        })
      }
    })
  }

  if (request.message === "update_response_likes") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      if (request.liked) {
        agent.Responses.like(request.response).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_response_likes_response", body: response, like: true });
        })
      } else {
        agent.Responses.unlike(request.response, request.like.id).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_response_likes_response", body: response, like: false });
        })
      }
    })
  }

  if (request.message === "delete_response") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Responses.del(request.response).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "delete_response_response", body: response });
      })
    })
  }

  if (request.message === "update_response") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]
      //delete response if body cleared
      if (request.body == "") {
        agent.Responses.del(request.response).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "delete_response_response", body: response });
        })
      }
      else {
        agent.Responses.update({...request.response, body: request.body }).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_response_response", body: response });
        })
      }
    })
  }

  if (request.message === "create_response") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]
      //handle empty body
      if (request.response.body == "") {
        chrome.tabs.sendMessage(activeTab.id, {message: "create_response_response"})
      } else {
        agent.Responses.create(request.respondableId, request.response).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "create_response_response", body: response });
        })
      }
    })
  }

  if (request.message === "get_primers") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Auth.primers().then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "get_primers_response", body: response });
      })
    })
  }

  if (request.message === "create_primer") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      agent.Primers.create({ title: request.title }).then(response => {
        chrome.tabs.sendMessage(activeTab.id, {message: "create_primer_response", body: response });

        window.analytics.track('Collection Created', {
          title: response.primer.title,
          userId: response.primer.users[0].id,
          context: 'midas'
        })

      })
    })
  }

  if (request.message === "update_primer") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0]

      // Send a message to the active tab
      if (request.privacy) {
        agent.Primers.update(request.primer).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_primer_response", body: response });
        })
      }
      else {
        agent.Primers.updateLogs(request.primer.slug, request.log.id, request.remove).then(response => {
          chrome.tabs.sendMessage(activeTab.id, {message: "update_primer_response", body: response });

          if (response.removed) {
            window.analytics.track('Log Removed', {
              id: response.log_id,
              contentId: response.content_id,
              primerId: request.primer.id,
              context: 'midas'
            })
          } else {
            window.analytics.track('Log Added', {
              id: response.log.id,
              contentId: response.content.id,
              primerId: response.log.currentPrimers[0].id,
              context: 'midas'
            })
          }
        })
      }
    })
  }
}
chrome.runtime.onMessage.addListener(messageListener)

wrapStore(store);
