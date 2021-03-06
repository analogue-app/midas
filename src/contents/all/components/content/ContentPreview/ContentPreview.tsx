import React from 'react';

import ProgressiveImage from 'react-progressive-image';
import placeholderImg from '../../../assets/img/placeholders/placeholder_1x1.jpg';

import ContentMedium from '../ContentMedium/ContentMedium';

import './ContentPreview.scss'

const ContentPreviewHeader = props => {

  if (props.content) {
    return (
      <div className="contentPreviewWrapper">
        <a
          target="_blank"
          className="contentPreview"
          href={`${process.env.NODE_ENV === 'production' ? 'https://www.analogue.app' : 'http://localhost:3000'}/${props.content.formSlug}/${props.content.slug}/@${props.user.username}`}
        >
          <ProgressiveImage
            src={props.content.imageUrl}
            placeholder={placeholderImg}
          >
            {(src, loading) => (
              <img className={loading ? "" : "blur"} src={src} alt={props.content.title} />
            )}
          </ProgressiveImage>

          <div className="contentDetails">
            <h5 className="title">{props.content.title}</h5>
            <ContentMedium content={props.content} />
          </div>
        </a>
      </div>
    )
  }
  return (
    <div className="contentPreviewWrapper">
      <div className="contentPreview loading">
        <div className="imgWrapper" />
        <div className="contentDetails">
          <h5 className="title" />
          <div className="details" />
        </div>
      </div>
    </div>
  )
}

export default ContentPreviewHeader;
