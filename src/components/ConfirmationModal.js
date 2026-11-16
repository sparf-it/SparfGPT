import React from 'react';
import './ConfirmationModal.css';
import { FiAlertTriangle, FiX } from 'react-icons/fi';

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel', showCancel = true }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <FiAlertTriangle className="modal-icon" />
            <h3>{title}</h3>
          </div>
          <button className="modal-close-btn" onClick={onCancel}>
            <FiX />
          </button>
        </div>
        <div className="modal-content">
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          {showCancel && (
            <button className="modal-cancel-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className="modal-confirm-btn" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
