// App.js
import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const SERVER_URL = process.env.REACT_APP_SERVER_URL;

function App() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null);
  const [loadingRootId, setLoadingRootId] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [followUps, setFollowUps] = useState({});
  const [viewingNoteId, setViewingNoteId] = useState(null);
  const [conversations, setConversations] = useState({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadNotes();
  }, []);

  // activeChat이 바뀔 때마다 스크롤
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat]);

  const loadNotes = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/notes`);
      if (!response.ok) throw new Error("서버 오류");
      const data = await response.json();
      const allNotes = Array.isArray(data) ? data : [];
      setNotes(allNotes);
      rebuildConversations(allNotes);
    } catch (error) {
      console.error("기록 조회 중 오류:", error);
      setNotes([]);
    }
  };

  // DB 노트에서 conversations 복원
  const rebuildConversations = (allNotes) => {
    const convs = {};
    // 후속 질문이 아닌 노트 = 첫 질문 (user_note가 "이전 질문:"으로 시작하지 않는 것)
    const rootNotesList = allNotes.filter((n) => !n.user_note.startsWith('이전 질문:'));
    // 후속 질문 노트
    const followUpNotes = allNotes.filter((n) => n.user_note.startsWith('이전 질문:'));

    rootNotesList.forEach((root) => {
      const type = root.ai_type === "claude" ? "nova" : root.ai_type || "gemini";
      const messages = [
        { role: "user", content: root.user_note, type },
      ];
      if (root.ai_note) {
        messages.push({ role: "ai", content: root.ai_note, type });
      }

      // 이 root에 연결된 후속 질문 찾기 (후속 질문의 "이전 질문" 내용이 root와 매칭)
      let currentUserContent = root.user_note;
      let currentAiContent = root.ai_note;
      let found = true;

      while (found) {
        found = false;
        for (let i = 0; i < followUpNotes.length; i++) {
          const fn = followUpNotes[i];
          if (fn._used) continue;
          // 후속 질문에서 실제 질문 추출
          const match = fn.user_note.match(/이전 질문: "(.+?)"\n이전 답변: "(.+?)"\n\n후속 질문: (.+)/s);
          if (match && match[1] === currentUserContent && match[2] === currentAiContent) {
            const followQuestion = match[3];
            const fType = fn.ai_type === "claude" ? "nova" : fn.ai_type || "gemini";
            messages.push({ role: "user", content: followQuestion, type: fType });
            if (fn.ai_note) {
              messages.push({ role: "ai", content: fn.ai_note, type: fType });
            }
            fn._used = true;
            currentUserContent = followQuestion;
            currentAiContent = fn.ai_note;
            found = true;
            break;
          }
        }
      }

      if (messages.length >= 2) {
        convs[root.id] = messages;
      }
    });

    setConversations((prev) => ({ ...prev, ...convs }));
  };

  const fetchNotes = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/notes`);
      if (!response.ok) throw new Error("서버 오류");
      const data = await response.json();
      setNotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("기록 조회 중 오류:", error);
      setNotes([]);
    }
  };

  const callAI = async (type, content) => {
    const saveRes = await fetch(`${SERVER_URL}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const saveData = await saveRes.json();
    const noteId = saveData.id;

    const endpoint = type === "gemini" ? "gemini-notes" : "nova-notes";
    await fetch(`${SERVER_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, noteId }),
    });

    const res = await fetch(`${SERVER_URL}/notes`);
    const allNotes = await res.json();
    setNotes(Array.isArray(allNotes) ? allNotes : []);

    const latest = allNotes.find((n) => n.id === noteId);
    return { noteId, aiNote: latest?.ai_note || null };
  };

  const requestAI = async (type) => {
    if (!newNote.trim() || isLoading) return;
    setIsLoading(true);
    setLoadingType(type);
    setLoadingRootId("new");
    setViewingNoteId(null);
    // 로딩 중에는 메인에 "..." 표시
    setActiveChat({ rootId: "new", messages: [{ role: "user", content: newNote, type }] });

    try {
      const { noteId, aiNote } = await callAI(type, newNote);
      const messages = [
        { role: "user", content: newNote, type },
        { role: "ai", content: aiNote, type },
      ];
      setActiveChat({ rootId: noteId, messages });
      setConversations((prev) => ({ ...prev, [noteId]: messages }));
      setNewNote("");
      setFollowUps((prev) => ({ ...prev, [noteId]: "" }));
    } catch (error) {
      console.error("AI 추천 요청 중 오류:", error);
      setActiveChat(null);
    } finally {
      setIsLoading(false);
      setLoadingType(null);
      setLoadingRootId(null);
    }
  };

  const handleFollowUp = async (type, rootId) => {
    const text = followUps[rootId] || "";
    if (!text.trim() || isLoading) return;

    const chat = { rootId, messages: conversations[rootId] || [] };
    setIsLoading(true);
    setLoadingType(type);
    setLoadingRootId(rootId);

    const lastAi = chat.messages.filter((m) => m.role === "ai").pop();
    const lastUser = chat.messages.filter((m) => m.role === "user").pop();
    const context = `이전 질문: "${lastUser?.content}"\n이전 답변: "${lastAi?.content}"\n\n후속 질문: ${text}`;

    const userMsg = { role: "user", content: text, type };
    const updatedMessages = [...chat.messages, userMsg];

    // 항상 메인 채팅으로 올림
    setActiveChat({ rootId, messages: updatedMessages });
    setConversations((prev) => ({ ...prev, [rootId]: updatedMessages }));

    try {
      const { aiNote } = await callAI(type, context);
      const aiMsg = { role: "ai", content: aiNote, type };
      const finalMessages = [...updatedMessages, aiMsg];

      setActiveChat({ rootId, messages: finalMessages });
      setConversations((prev) => ({ ...prev, [rootId]: finalMessages }));
      setFollowUps((prev) => ({ ...prev, [rootId]: "" }));
    } catch (error) {
      console.error("후속 질문 중 오류:", error);
    } finally {
      setIsLoading(false);
      setLoadingType(null);
      setLoadingRootId(null);
    }
  };

  const deleteNotes = async () => {
    if (!window.confirm("모든 기록을 삭제하시겠습니까?")) return;
    try {
      await fetch(`${SERVER_URL}/notes`, { method: "DELETE" });
      await fetchNotes();
      setActiveChat(null);
      setConversations({});
      setViewingNoteId(null);
      setFollowUps({});
    } catch (error) {
      console.error("전체 기록 삭제 중 오류:", error);
    }
  };

  const rootNotes = notes.filter((n) => conversations[n.id]);

  const handleHistoryClick = (noteId) => {
    setViewingNoteId(viewingNoteId === noteId ? null : noteId);
  };

  return (
    <div className="App">
      <div className="container">
        <h1><span className="title-emoji">🤔</span> <span className="title-text">당신의 결정을 도와드립니다.</span></h1>
        <h3>고민을 입력하고, AI를 선택해서 바로 추천을 받아보세요.</h3>

        <div className="input-section">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="예: 점심 메뉴 추천해줘 / 오늘 뭐 입을지 골라줘 / 여행지 추천해줘"
            className="note-input"
            disabled={isLoading}
          />
          <div className="button-group">
            <button
              onClick={() => requestAI("gemini")}
              disabled={isLoading || !newNote.trim()}
              className="gemini-button"
            >
              {loadingRootId === "new" && loadingType === "gemini" ? "🤖 Gemini 고민 중..." : "🤖 Gemini 추천"}
            </button>
            <button
              onClick={() => requestAI("nova")}
              disabled={isLoading || !newNote.trim()}
              className="nova-button"
            >
              {loadingRootId === "new" && loadingType === "nova" ? "🌟 Nova 고민 중..." : "🌟 Nova 추천"}
            </button>
          </div>
          <div className="button-hints">
            <span className="hint gemini-hint">맛집·여행·취미 등 일상 추천</span>
            <span className="hint nova-hint">비교·분석이 필요한 결정</span>
          </div>
        </div>

        {activeChat && (
          <div className="chat-section">
            <div className="chat-card">
              {activeChat.messages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "ai-bubble"}`}>
                  <span className="bubble-label">
                    {msg.role === "user"
                      ? "💭 나"
                      : msg.type === "gemini" ? "🤖 Gemini" : "🌟 Nova"}
                  </span>
                  <p>{msg.content}</p>
                </div>
              ))}

              {isLoading && loadingRootId === activeChat.rootId && (
                <div className="chat-bubble ai-bubble">
                  <span className="bubble-label">
                    {loadingType === "gemini" ? "🤖 Gemini" : "🌟 Nova"}
                  </span>
                  <p className="typing">고민 중...</p>
                </div>
              )}

              <div ref={chatEndRef} />
              <div className="follow-up-input">
                <input
                  type="text"
                  value={followUps[activeChat.rootId] || ""}
                  onChange={(e) => setFollowUps((prev) => ({ ...prev, [activeChat.rootId]: e.target.value }))}
                  placeholder="후속 질문을 입력하세요..."
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isLoading && (followUps[activeChat.rootId] || "").trim()) {
                      const lastType = activeChat.messages.filter((m) => m.role === "ai").pop()?.type || "gemini";
                      handleFollowUp(lastType, activeChat.rootId);
                    }
                  }}
                />
                <div className="follow-up-buttons">
                  <button onClick={() => handleFollowUp("gemini", activeChat.rootId)} disabled={isLoading || !(followUps[activeChat.rootId] || "").trim()} className="gemini-button small">🤖</button>
                  <button onClick={() => handleFollowUp("nova", activeChat.rootId)} disabled={isLoading || !(followUps[activeChat.rootId] || "").trim()} className="nova-button small">🌟</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="history-header">
          <h2>📋 질문 기록</h2>
          {rootNotes.length > 0 && (
            <button onClick={deleteNotes} className="danger-button small">전체 삭제</button>
          )}
        </div>
        <div className="history-container">
          {rootNotes.length === 0 ? (
            <p className="no-notes">아직 질문 기록이 없습니다.</p>
          ) : (
            rootNotes.map((note) => {
              const conv = conversations[note.id] || [];
              const firstQuestion = conv.find((m) => m.role === "user")?.content || note.user_note;
              const isViewing = viewingNoteId === note.id;

              return (
                <div key={note.id}>
                  <div
                    className={`history-item ${isViewing ? "active" : ""}`}
                    onClick={() => handleHistoryClick(note.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleHistoryClick(note.id)}
                  >
                    <span className="history-icon">
                      {conv[1]?.type === "gemini" ? "🤖" : "🌟"}
                    </span>
                    <span className="history-text">{firstQuestion}</span>
                    <span className="history-badge">{Math.floor(conv.length / 2)}회 대화</span>
                  </div>

                  {isViewing && (
                    <div className="thread-panel">
                      {conv.map((msg, idx) => (
                        <div key={idx} className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "ai-bubble"}`}>
                          <span className="bubble-label">
                            {msg.role === "user" ? "💭 나" : msg.type === "gemini" ? "🤖 Gemini" : "🌟 Nova"}
                          </span>
                          <p>{msg.content}</p>
                        </div>
                      ))}

                      {isLoading && loadingRootId === note.id && (
                        <div className="chat-bubble ai-bubble">
                          <span className="bubble-label">{loadingType === "gemini" ? "🤖 Gemini" : "🌟 Nova"}</span>
                          <p className="typing">고민 중...</p>
                        </div>
                      )}

                      <div className="follow-up-input">
                        <input
                          type="text"
                          value={followUps[note.id] || ""}
                          onChange={(e) => setFollowUps((prev) => ({ ...prev, [note.id]: e.target.value }))}
                          placeholder="후속 질문을 입력하세요..."
                          disabled={isLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isLoading && (followUps[note.id] || "").trim()) {
                              const lastType = conv.filter((m) => m.role === "ai").pop()?.type || "gemini";
                              handleFollowUp(lastType, note.id);
                            }
                          }}
                        />
                        <div className="follow-up-buttons">
                          <button onClick={() => handleFollowUp("gemini", note.id)} disabled={isLoading || !(followUps[note.id] || "").trim()} className="gemini-button small">🤖</button>
                          <button onClick={() => handleFollowUp("nova", note.id)} disabled={isLoading || !(followUps[note.id] || "").trim()} className="nova-button small">🌟</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
