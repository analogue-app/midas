import React, { useEffect, useRef, useState } from 'react';
import { TrixEditor } from "react-trix";
import { Timeline } from "antd";
import trix from "trix";
import { User, Knot } from '../../../global/types';

import "trix/dist/trix.css";
import "../Trix.scss";
import "../Knot/Knot.scss"
import "./KnotEditor.scss";

interface Props {
  knot: Knot
  onMetaEnter?: () => void
  onEnter?: () => void
  currentUser: User
  hasKnots: boolean
  autoFocus?: () => void
  onChange?: () => void
}

const KnotEditor = props => {

  const [imageDeleteList, setImageDeleteList] = useState([])
  const [body, setBody] = useState(props.knot ? props.knot.body : "")
  const [bodyText, setBodyText] = useState(props.knot ? props.knot.bodyText : "")

  const knotEditor = useRef<HTMLInputElement>(null);

  // custom hook for attaching and removing event listeners
  // https://dev.to/adrianbdesigns/custom-react-hooks-useeventlistener-1kp
  const useEventListener = (target, type, listener, ...options) => {
    useEffect(() => {
      const targetIsRef = target.hasOwnProperty("current");
      const currentTarget = targetIsRef ? target.current : target;
      if (currentTarget)
        currentTarget.addEventListener(type, listener, ...options);
      return () => {
        if (currentTarget)
          currentTarget.removeEventListener(type, listener, ...options);
      };
    }, [target, type, listener, options])
  }

  const onKeyDown = (e) => {
    if (e.key == "Enter" && (e.metaKey || e.ctrlKey)) {
      if (props.onMetaEnter) {
        props.onMetaEnter();
      } else if (!props.onEnter) {
        this.updateKnot();
      }
    }

    if (e.key == "Enter" && props.onEnter) {
      e.preventDefault();
      props.onEnter()
    }
  }

  const onChange = (html, text) => {
    setBody(html)
    setBodyText(text)
  }

  const handleEditorReady = (trix) => {
    this.trixEditor = trix

    useEventListener(knotEditor, "keydown", onKeyDown);
    // trix specific
    useEventListener(knotEditor, "trix-change", handleEditorChange)
    if (props.knot) {
      useEventListener(knotEditor, "trix-file-accept", trixFileAcceptEvent)
      useEventListener(knotEditor, "trix-attachment-add", trixAddAttachmentEvent)
      useEventListener(knotEditor, "trix-attachment-remove", trixRemoveAttachmentEvent)
    }
  }

  const handleEditorChange = (event) => {
    const editor = event.target.editor
    if (!editor.attributeIsActive("code")) {
      const position = editor.getPosition()
      if (position > 1) {
        const text = editor.getDocument().toString()
        const character = text.charAt(position - 1)
        const before = text.charAt(position - 2)

        // replace double hyphen with em dash
        if (character === "-" && before === "-") {
          editor.setSelectedRange([position-2, position])
          editor.deleteInDirection("backward")
          editor.insertString("—")
        }
      }
    }
  }

  const trixAddAttachment = () => {
    const fileInput = document.createElement("input")

    fileInput.setAttribute("type", "file")
    fileInput.setAttribute("accept", ".jpg, .png, .gif")
    fileInput.setAttribute("multiple", "")

    fileInput.addEventListener("change", () => {
      const { files } = fileInput
      Array.from(files).forEach(this.insertAttachment)
    })

    fileInput.click()
  }

  const insertAttachment = (file) => {
    this.trixEditor.insertFile(file)
  }

  const trixRemoveAttachmentEvent = (event) => {
    const attributes = event.attachment.getAttributes();
    setImageDeleteList([...imageDeleteList, attributes.attachment_id])
  }

  const trixFileAcceptEvent = (e) => ({ file: { name }}) => {
    const [extension] = name.split('.').slice(-1)
    if (['png', 'jpg', 'gif'].indexOf(extension.toLowerCase()) === -1) {
      e.preventDefault()
    }
  }

  const trixAddAttachmentEvent = (event) => {
    this.uploadAttachment(event.attachment)
  }

  const uploadAttachment = (attachment) => {
    var file = attachment.file;

    if (file) {
      var form = new FormData();
      var xhr = new XMLHttpRequest();
      var uploadUrl = `/api/knots/${props.knot ? props.knot.id : 0}/upload`;
      var maxFileSize = 10485760; // 10MB
      var authToken = `Token ${props.currentUser.token}`;

      window.onbeforeunload = function(e) {
        var event = e || window.event;
        var warn = 'Uploads are pending. If you quit this page they may not be saved.';
        if (event) {
          event.returnValue = warn;
        }
        return warn;
      };

      if (file.size === 0) {
        window.onbeforeunload = function() {};
        attachment.remove();
        alert("The file you submitted looks empty.");
        return;
      } else if (file.size > maxFileSize) {
        window.onbeforeunload = function() {};
        attachment.remove();
        alert("Maximum image size is 10MB.");
        return;
      }

      form.append("Content-Type", file.type);
      form.append("file", file);

      xhr.overrideMimeType("application/json");
      xhr.open("POST", uploadUrl, true);
      xhr.setRequestHeader('authorization', authToken);

      xhr.upload.onprogress = function(event) {
        var progress = event.loaded / event.total * 100;
        return attachment.setUploadProgress(progress);
      };
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          window.onbeforeunload = function() {};
          var jsonResponse = JSON.parse(xhr.responseText);
          return attachment.setAttributes({
            url: jsonResponse.url,
            attachment_id: jsonResponse.id
          });
        } else {
          window.onbeforeunload = function() {};
          attachment.remove();
          alert("Upload failed. Try to reload the page.");
        }
      };
      return xhr.send(form);
    } else {
      // delete file from deleteList if file doesn't exist (since this indicates a redo)
      const attributes = attachment.getAttributes();
      setImageDeleteList(imageDeleteList.filter((id) => { return id !== attributes.attachment_id }))
    }
  }

  return (
    <Timeline.Item className={`knot ${props.hasKnots ? "" : "ant-timeline-item-last"}`}>
      <div className="knotCard">
        <div className="knotEditorWrapper">
          <div className="knotEditor" ref={knotEditor}>
            <TrixEditor
              autoFocus={props.autoFocus}
              placeholder={props.hasKnots ? "Add another note..." : "Add a note..."}
              value={props.knot ? props.knot.body : ""}
              onEditorReady={handleEditorReady}
              onChange={props.knot ? onChange : props.onChange}
              mergeTags={[]}
            />
          </div>
        </div>
      </div>
    </Timeline.Item>
  )
}

// class KnotEditor extends PureComponent {
//
//   platform = window.navigator.platform.includes("Mac")
//
//   updateKnot = () => {
//     if (this.state.body !== props.knot.body && this.state.body !== "") {
//       this.setState({ saveLoading: true, saveSuccess: false });
//       if (this.state.imageDeleteList) {
//         this.state.imageDeleteList.map((id) => agent.Knots.deleteImage(id))
//       }
//       const newKnot = {
//         ...props.knot,
//         body: this.state.body,
//         bodyText: this.state.bodyText
//       }
//       props.onSubmit(agent.Knots.update(newKnot))
//     }
//     // else {
//     //   if (props.hideEditor) { props.hideEditor() }
//     // }
//   }
//
//
//   componentDidUpdate(prevProps) {
//     // update editor content if knot has changed
//     if (prevProps.knot && prevProps.knot.body !== props.knot.body) {
//       if (knotEditor) {
//         knotEditor.firstElementChild.firstElementChild.nextElementSibling.innerHTML = props.knot.body;
//       }
//     }
//   }
//
export default KnotEditor;
