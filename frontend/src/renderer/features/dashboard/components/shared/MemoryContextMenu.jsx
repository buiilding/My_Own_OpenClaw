import PropTypes from 'prop-types';

function MemoryContextMenu({
  menu = null,
  isDeleting = false,
  onDelete,
  onClose,
}) {
  if (!menu) {
    return null;
  }

  return (
    <>
      <div
        className="memory-context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          className="danger"
          disabled={isDeleting}
          onClick={() => onDelete(menu)}
        >
          Delete
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
        }}
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
    </>
  );
}

MemoryContextMenu.propTypes = {
  menu: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  isDeleting: PropTypes.bool,
  onDelete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default MemoryContextMenu;
