/*global chrome*/

import React, { useEffect, useState } from 'react';
import Frame, { FrameContextConsumer } from 'react-frame-component';
import { useDispatch, useSelector } from "react-redux";
import { hot } from 'react-hot-loader/root';
import * as Sentry from '@sentry/browser';

import agent from '../../../../background/agent';
import ContentPreview from '../content/ContentPreview/ContentPreview';
import Knots from '../knot/Knots/Knots';
import PrimerSelect from '../primer/PrimerSelect/PrimerSelect';
import LoginForm from './LoginForm';
import Activity from '../activity/Activity';
import KeyboardShortcut from '../common/KeyboardShortcut/KeyboardShortcut';
import BottomBar from '../navigation/BottomBar/BottomBar';
import BottomBand from '../navigation/BottomBar/BottomBand';

import { Menu, Dropdown, Button } from 'antd';
import { CloseOutlined, DownOutlined, PlusOutlined, BellOutlined } from '@ant-design/icons';

import logo from '../../assets/img/logo.png';
import logoIcon from '../../assets/img/logo_icon.png';
import './App.scss';
import '../Anchor/Anchor.scss'

const statusMessage = {
  pub: "Added",
  saved: "Queued",
  priv: "Added privately",
  activity: "Activity"
}

const App = () => {

  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [login, setLogin] = useState(false)
  const [userLoading, setUserLoading] = useState(false)
  const [activity, setActivity] = useState(false)

  const [content, setContent] = useState(null)
  const [log, setLog] = useState(null)
  const [knots, setKnots] = useState(null)

  const [message, setMessage] = useState("Loading...");

  const user = useSelector(state => state.user);
  const dispatch = useDispatch();

  const [primersHeight, setPrimersHeight] = useState(0)
  const updatePrimersHeight = (height: number) => setPrimersHeight(height)

  // set message listener when component mounts
  useEffect(() => {
    chrome.runtime.onMessage.addListener(messageListener)

    if (user && process.env.NODE_ENV === 'production') {
      // set sentry scope
      Sentry.configureScope((scope) => {
        scope.setUser({
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          username: user.username
        });
      });
    }

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [user, content, log, knots])

  const updateLogStatus = target => {
    if (target.key == "delete") {
	      chrome.runtime.sendMessage({ message: "delete_log", id: log.id })
      setShow(false)
      setLog(null)
      setContent(null)
    }
    else if (target.key == "activity") {
      setActivity(true)
    }
    else if (activity) {
      clickHint()
    }
    else {
      const newLog = { ...log, status: target.key }
      setLog(newLog)
      setMessage(statusMessage[target.key])
      chrome.runtime.sendMessage({ message: "log_update", log: newLog })
    }
  }

  const createKnot = (bodyHtml, bodyText, requestLog=null) => {
    setLoading(true)
    chrome.runtime.sendMessage({
      message: "create_knot",
      log: requestLog ? requestLog : log,
      knot: {
        body: bodyHtml,
        bodyText: bodyText
      }
    })
  }

  const clickHint = () => {
    setActivity(false)
    chrome.runtime.sendMessage({
      message: "parse_content",
    })
  }

  const messageListener = (request, sender, sendResponse) => {
    // sender.id is id of chrome extension

    if (request.message === "content_script_loaded?") {
      sendResponse({ status: true }) // respond to background page
    }

    if (request.message === "auth_user_response") {
      setUserLoading(true)
      dispatch({ type: 'SET_USER', user: request.body.user })
      setUserLoading(false)
      setLogin(false)
      if (request.activity) {
        setActivity(true)
        chrome.runtime.sendMessage({message: "get_activity"})
      }
      else {chrome.runtime.sendMessage({
        message: "parse_content",
        goodies: request.goodies
      })}
    }

    if (request.message === "clicked_browser_action") {
      chrome.storage.local.get("analogueJWT", function(token) {
        if (!user && Object.keys(token).length !== 0) {
          setUserLoading(true)
          chrome.runtime.sendMessage({
            message: "get_current_user",
            token: token.analogueJWT,
            activity: request.activity,
            goodies: {
              highlight: request.highlight,
              youtube: { timestamp: request.timestamp, url: request.url }
            }
          })
        }
      })

      //show with user
      if (user) {
        setUserLoading(false)
        setLogin(false)
        setShow(true)

        if (!request.activity) {
          setActivity(false)
          //parse if no content
          if (!content) {
            chrome.runtime.sendMessage({
              message: "parse_content",
              goodies: {
                highlight: request.highlight
              }
            })
          } else {
            //highlight to note
            if (request.highlight) {
              createKnot(("<blockquote>" + request.highlight.toString("html") + "</blockquote>"), request.highlight)
            }
            //youtube timestamp
            if (request.timestamp) {
              createKnot(("<a target='_blank' href=" + request.url + ">" + request.timestamp.toString("html") + "</a>"), request.timestamp)
            }
          }
          //activity
        } else {
          setActivity(true)
        }
        //else, show login
      } else {
        if (!userLoading) setLogin(true)
        setShow(true)
      }

      //close extension if no text is highlighted on browser action
      if (show && !request.timestamp && !request.highlight && !activity && !request.activity) {
        setShow(false)
        setContent(false)
      }
    }

    if (request.message === "parse_content_response") {
      if (request.body.errors) {
        setMessage(request.body.message ? request.body.message : "We're having trouble with that URL . . . ")
      } else {
        setMessage(request.body.log && request.body.log.status
          ? statusMessage[request.body.log.status]
          : "Added"
        )
        setContent(request.body.content)
        setLog(request.body.log)
        if (request.goodies) {
          if (request.goodies.highlight) {
            console.log("yessir")
            createKnot(("<blockquote>" + request.goodies.highlight.toString("html") + "</blockquote>"), request.goodies.highlight, request.body.log)
          }

          if (request.goodies.youtube) {
            createKnot(("<a target='_blank' href=" + request.goodies.youtube.url + ">" + request.goodies.youtube.timestamp.toString("html") + "</a>"), request.goodies.youtube.timestamp, request.body.log)
          }
        }
      }
    }

    // optional for response from log_update
    // if (request.message === "log_update_response") {
    //   setMessage(request.body.log && request.body.log.status
    //     ? statusMessage[request.body.log.status]
    //     : "Added"
    //   )
    //   setLog(request.body.log)
    // }

    if (request.message === "get_knots_response") {
      setKnots(request.body.knots)
    }

    if (request.message === "create_knot_response") {
      setLoading(false)
      chrome.runtime.sendMessage({ message: "get_knots", log: log })
    }

    if (request.message === "delete_knot_response") {
      setKnots(knots.filter(knot => knot.id !== request.body.id))
    }

    if (request.message === "edit_knot_response") {
      setKnots(knots.map(knot => {
        if (knot.id === request.body.id) {
          return {
            ...knot,
            ...request.body
          }
        }
        return knot;
      }))
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        width: "400px",
        right: "21px",
        top: "21px",
        zIndex: 2147483647,
        willChange: "transform",
        transform: show ? "translateX(0)" : "translateX(421px)",
        transition: "transform 0.21s ease-in-out",
      }}
    >
      <Frame
        style={{
          width: "100%",
          height: "100vh",
          display: "block",
          border: "none"
        }}
        head={[<link type="text/css" rel="stylesheet" href={chrome.runtime.getURL("/css/all.css")}></link>]}
      >
       <FrameContextConsumer>
       {
         // Callback is invoked with iframe's window and document instances
         ({document, window}) => {
            // Render Children
            return (
              <div className={`analogueModal ${content ? "loaded" : ""}`} onClick={(e) => {
                e.stopPropagation()
              }}>

                {userLoading &&
                  <div className="analogueModalHeader loading">

                    <img src={logoIcon} className="logo icon" alt="Analogue" />

                    <div className="dropdownStatus"> Loading... </div>
                  </div>
                }

                {login && !userLoading &&
                  <>
                    <div className="analogueModalHeader login">

                    <a
                      target="_blank"
                      href={`${process.env.NODE_ENV === 'production' ? 'https://www.analogue.app' : 'http://localhost:3000'}`}
                    >
                      <img src={logo} className="logo" alt="Analogue"/>
                    </a>

                      <CloseOutlined
                        className="closeBtn"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShow(false)
                          setContent(false)
                        }}
                      />
                    </div>
                    <div className="loginForm">
                      <LoginForm
                      />
                    </div>
                  </>
                }

                {activity && !login && !userLoading &&
                  <>
                    <div className="analogueModalHeader activity" id='analogueHeader'>

                      <img src={logoIcon} className="logo icon" alt="Analogue" />

                      <Dropdown
                        align={{offset: [-14, 15]}}
                        overlayClassName="dropdownStatusOverlay"
                        getPopupContainer={() => document.getElementById("analogueHeader")}
                        overlay={
                          <Menu onClick={updateLogStatus}>
                            {activity &&
                              <Menu.Item danger key="pub">
                                Log Content
                              </Menu.Item>
                            }
                          </Menu>
                        }
                      >
                        <div className="dropdownStatus">
                          Activity
                          {<DownOutlined /> }
                        </div>
                      </Dropdown>

                      <CloseOutlined
                        className="closeBtn"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShow(false)
                          setContent(false)
                        }}
                      />

                    </div>
                    <Activity />
                    <BottomBand clickHint={clickHint} clickActivity={() => setActivity(true)} />

                  </>


                }

                {show && !login && !userLoading && !activity &&
                  <>
                    <div className="analogueModalHeader" id='analogueHeader'>

                      <img src={logoIcon} className="logo icon" alt="Analogue" />

                      <Dropdown
                        disabled={!log}
                        align={{offset: [-14, 15]}}
                        overlayClassName="dropdownStatusOverlay"
                        getPopupContainer={() => document.getElementById("analogueHeader")}
                        overlay={
                          <Menu onClick={updateLogStatus}>
                            {log && log.status !== "pub" &&
                              <Menu.Item key="pub">
                                Add to library
                              </Menu.Item>
                            }
                            {log && log.status !== "saved" &&
                              <Menu.Item key="saved">
                                Queue
                              </Menu.Item>
                            }
                            {log && log.status !== "priv" &&
                              <Menu.Item key="priv">
                                Add privately
                              </Menu.Item>
                            }
                            {log &&
                              <Menu.Item key="delete">
                                Delete
                              </Menu.Item>
                            }
                            {log &&
                              <Menu.Item danger key="activity">
                                Activity
                              </Menu.Item>
                            }
                          </Menu>
                        }
                      >
                        <div className="dropdownStatus">
                          {message}
                          {log && <DownOutlined /> }
                        </div>
                      </Dropdown>

                      <CloseOutlined
                        className="closeBtn"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShow(false)
                          setContent(false)
                        }}
                      />
                    </div>

                    <ContentPreview content={content} user={user} />

                    <Knots
                      loading={loading}
                      log={log}
                      knots={knots}
                      primersHeight={primersHeight}
                      createKnot={createKnot}
                    />

                    {log &&
                      <PrimerSelect
                        log={log}
                        content={content}
                        updatePrimersHeight={updatePrimersHeight}
                      />
                    }
                  </>
                }
              </div>
            )
          }
        }
        </FrameContextConsumer>
      </Frame>
    </div>
  )
}

export default hot(App);
