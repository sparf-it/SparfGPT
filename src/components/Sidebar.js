import React, { useContext, useState } from 'react';
import { ConversationContext } from '../context/ConversationContext';
// We'll use SettingsContext later when we implement theme switching
// import { SettingsContext } from '../context/SettingsContext';
import './Sidebar.css';
import { FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';
import ConfirmationModal from './ConfirmationModal';

const Sidebar = ({ isOpen, toggleSidebar, toggleSettings }) => {
  const { 
    conversations, 
    currentConversationId, 
    setCurrentConversationId, 
    createNewConversation, 
    updateConversationTitle, 
    deleteConversation 
  } = useContext(ConversationContext);
  
  // We'll use settings later when we implement theme switching
  // const { settings } = useContext(SettingsContext);
  
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);

  const handleNewChat = () => {
    createNewConversation();
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
    
    // On mobile, close sidebar after selection
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
  };

  const handleEditClick = (e, conversation) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (editTitle.trim()) {
      updateConversationTitle(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    setConversationToDelete(id);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete);
      setShowDeleteModal(false);
      setConversationToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteModal(false);
    setConversationToDelete(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <div className={`sidebar-wrapper ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-toggle-bar" onClick={toggleSidebar}>
          <div className="sidebar-toggle-handle"></div>
        </div>
        
        <div className="sidebar">
        <button className="new-chat-btn" onClick={handleNewChat}>
          <FiPlus /> New Chat
        </button>
        
        <div className="conversations-section-label">Recent Chats</div>
        <div className="conversations-list">
          {conversations.map(conversation => (
            <div 
              key={conversation.id}
              className={`conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`}
              onClick={() => handleSelectConversation(conversation.id)}
            >
              {editingId === conversation.id ? (
                <form onSubmit={handleEditSubmit} className="edit-title-form">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    onBlur={handleEditSubmit}
                  />
                </form>
              ) : (
                <>
                  <div className="conversation-info">
                    <span className="conversation-title">{conversation.title || 'New Conversation'}</span>
                    <span className="conversation-date">{formatDate(conversation.updatedAt)}</span>
                  </div>
                  <div className="conversation-actions">
                    <button onClick={(e) => handleEditClick(e, conversation)}>
                      <FiEdit2 />
                    </button>
                    <button onClick={(e) => handleDeleteClick(e, conversation.id)}>
                      <FiTrash2 />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  );
};

export default Sidebar;
