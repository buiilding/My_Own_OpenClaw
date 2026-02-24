const SectionIntro = ({
  badge,
  headingPrefix,
  headingGradient,
  description,
  wrapperClassName,
  headingClassName = 'heading-2 mb-4',
  descriptionClassName = 'text-large text-secondary',
}) => {
  const introContent = (
    <>
      <span className="badge badge-primary mb-4">{badge}</span>
      <h2 className={headingClassName}>
        {headingPrefix}
        <br />
        <span className="gradient-text">{headingGradient}</span>
      </h2>
      <p className={descriptionClassName}>{description}</p>
    </>
  );

  if (!wrapperClassName) {
    return introContent;
  }

  return <div className={wrapperClassName}>{introContent}</div>;
};

export default SectionIntro;
