import React from 'react';

import Knot from '../Knot/Knot';
import KnotInput from '../KnotInput/KnotInput';

import { Timeline } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

import { Log } from '../../../global/types'

import './Knots.scss';

interface Props {
  log: Log
  knots: any[]
  show: boolean
  loading: boolean
  primersHeight: number
  createKnot: (bodyHtml: string, bodyText: string) => void
  deleteKnot: any
  editKnot: any
}

const Knots = (props: Props) => {
  const hasKnots = props.knots && props.knots.length > 0

  return (
    <div
      style={props.primersHeight ? { maxHeight: `calc(100vh - ${275 + props.primersHeight}px)` } : {}}
      className={`knots ${props.log ? "show" : ""}`}
    >
      <KnotInput
        show={props.show}
        createKnot={props.createKnot}
        hasKnots={hasKnots}
      />
      {props.loading &&
        <Timeline.Item
          dot={<LoadingOutlined />}
          className={`knotLoading ${hasKnots ? "" : "ant-timeline-item-last"}`}
        />
      }
      {hasKnots &&
        props.knots.map((knot, index) =>
          <Knot
            key={knot.id}
            knot={knot}
            index={index}
            totalKnots={props.knots.length}
            isLast={props.knots.length-1 === index}
            editKnot={props.editKnot}
            deleteKnot={props.deleteKnot}
          />
        )
      }
    </div>
  )
}

export default Knots;
