import React, { useState } from 'react';
import { Button } from 'antd';
import { Primer, Log } from '../../../global/types';

import ProgressiveImage from 'react-progressive-image';
import placeholderImg from '../../../assets/img/placeholders/placeholder_1x1.jpg';

import { mediumIcons } from '../../content/ContentMedium/ContentMedium';
import { LockOutlined, UnlockOutlined, CheckOutlined, UsergroupAddOutlined } from '@ant-design/icons';

import './PrimerItem.scss'

interface Props {
  log?: Log
  primer?: Primer
  collection?: string
  selectable?: boolean
  select?: boolean
  updateCurrentPrimers?: (primer: Primer, remove: boolean) => void
}

const PrimerItem = ({
  log,
  primer,
  collection,
  selectable,
  select,
  updateCurrentPrimers
}: Props) => {

  const [selected, setSelected] = useState(select || false)
  const [priv, setPrivate] = useState(primer ? primer.private : false)

  const togglePrimer = (e) => {
    updateCurrentPrimers(primer, selected)
    setSelected(!selected)
  }

  const changePrivacy = () => {
    setPrivate(!priv)
    chrome.runtime.sendMessage({
      message: "update_primer",
      primer: {...primer, private: !priv},
      privacy: true
    })
  }

  if (collection) {
    return (
      <div className={`primerItem collection ${selectable ? "selectable selected" : ""}`}>
        <div className="imgWrapper">
          {mediumIcons[collection]}
        </div>

        <h5 className="title">{collection}</h5>

        {selectable &&
          <div className="addBtn">
            <Button><CheckOutlined /></Button>
          </div>
        }
      </div>
    )
  }

  return (
    <div
      className={`primerItem ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
    >
      {selectable &&
        <div className="addBtn" onClick={selectable ? togglePrimer : null}>
          <Button> {selected ? <CheckOutlined /> : "Add"}</Button>
        </div>
      }
      <div className="imgWrapper">
        <ProgressiveImage
          src={primer.image}
          placeholder={placeholderImg}
        >
          {(src, loading) => (
            <img src={src} alt={primer.title} />
          )}
        </ProgressiveImage>
      </div>

      <h5 className="title">{primer.title}</h5>

      {primer.shared && <UsergroupAddOutlined className="infoIcon" /> }

      <Button className="lockBtn" icon={priv ? <LockOutlined /> : <UnlockOutlined />}
      onClick={() => changePrivacy()} size={"small"} />
    </div>
  )
}

export default PrimerItem
