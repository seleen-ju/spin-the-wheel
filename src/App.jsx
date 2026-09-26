import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";
import { questions } from "./questions";

function App() {
  const [screen, setScreen] = useState("home");
  const [isFullscreen, setIsFullscreen] = useState(false);
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error("Fullscreen error:", error);
  }
}

useEffect(() => {
  function handleFullscreenChange() {
    setIsFullscreen(!!document.fullscreenElement);
  }

  document.addEventListener(
    "fullscreenchange",
    handleFullscreenChange
  );

  return () => {
    document.removeEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );
  };
}, []);

  const [gameCode, setGameCode] = useState("");
  const [playerGameCode, setPlayerGameCode] = useState("");
  const [gameId, setGameId] = useState(null);

  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");

  const [timeLeft, setTimeLeft] = useState(30);
  const [timeUp, setTimeUp] = useState(false);

  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [roundStatus, setRoundStatus] = useState("waiting");

  // --------------------------------------------------
  // TIMER
  // --------------------------------------------------

  useEffect(() => {
    if (!question || timeUp) {
      return;
    }

    if (
      roundStatus === "correct" ||
      roundStatus === "no_correct_answer" ||
      roundStatus === "time_up" ||
      roundStatus === "ended"
    ) {
      return;
    }

    if (timeLeft <= 0) {
      handleTimeUp();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [question, timeLeft, timeUp, roundStatus]);

  // --------------------------------------------------
  // REALTIME
  // --------------------------------------------------

  useEffect(() => {
    if (!gameId) {
      return;
    }

    console.log("Subscribing to game:", gameId);

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        (payload) => {
          console.log("REALTIME EVENT RECEIVED:", payload);

          const updatedGame = payload.new;

          if (!updatedGame || updatedGame.id !== gameId) {
            return;
          }

          console.log("THIS IS OUR GAME:", updatedGame);

          setGameCode(updatedGame.game_code || gameCode);
          setCategory(updatedGame.category || "");
          setQuestion(updatedGame.question || "");
          setCorrectAnswer(updatedGame.correct_answer || "");
          setCurrentPlayer(updatedGame.current_player ?? null);
          setRoundStatus(updatedGame.round_status || "waiting");

          if (updatedGame.time_started) {
            const startedAt = new Date(
              updatedGame.time_started
            ).getTime();

            const elapsed = Math.floor(
              (Date.now() - startedAt) / 1000
            );

            const remaining = Math.max(
              0,
              (updatedGame.time_limit || 30) - elapsed
            );

            setTimeLeft(remaining);
            setTimeUp(remaining <= 0);
          } else {
            setTimeLeft(updatedGame.time_limit || 30);
            setTimeUp(false);
          }
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      console.log("Removing realtime channel:", gameId);
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // --------------------------------------------------
  // CREATE GAME
  // --------------------------------------------------

  async function createGame() {
    const newCode = Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase();

    const { data, error } = await supabase
      .from("games")
      .insert({
        game_code: newCode,
        round_status: "waiting",
        time_limit: 30,
      })
      .select()
      .single();

    if (error) {
      console.error("CREATE GAME ERROR:", error);
      alert("Could not create the game.");
      return;
    }

    console.log("GAME CREATED:", data);

    setGameCode(data.game_code);
    setGameId(data.id);

    setCategory("");
    setQuestion("");
    setCorrectAnswer("");
    setCurrentPlayer(null);
    setRoundStatus("waiting");
    setTimeLeft(30);
    setTimeUp(false);

    setScreen("host");
  }

  // --------------------------------------------------
  // JOIN GAME
  // --------------------------------------------------

  async function joinGame() {
    const code = playerGameCode.trim().toUpperCase();

    if (!code) {
      alert("Please enter a game code.");
      return;
    }

    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("game_code", code)
      .single();

    if (error || !data) {
      console.error("JOIN GAME ERROR:", error);
      alert("Game not found. Check the code.");
      return;
    }

    console.log("JOINED GAME:", data);

    setGameId(data.id);
    setPlayerGameCode(data.game_code);

    setCategory(data.category || "");
    setQuestion(data.question || "");
    setCorrectAnswer(data.correct_answer || "");
    setCurrentPlayer(data.current_player ?? null);
    setRoundStatus(data.round_status || "waiting");

    if (data.time_started) {
      const startedAt = new Date(data.time_started).getTime();

      const elapsed = Math.floor(
        (Date.now() - startedAt) / 1000
      );

      const remaining = Math.max(
        0,
        (data.time_limit || 30) - elapsed
      );

      setTimeLeft(remaining);
      setTimeUp(remaining <= 0);
    } else {
      setTimeLeft(data.time_limit || 30);
      setTimeUp(false);
    }
  }

  // --------------------------------------------------
  // SELECT CATEGORY
  // --------------------------------------------------

  function selectCategory(selectedCategory) {
    setCategory(selectedCategory);
  }

  // --------------------------------------------------
  // RANDOMIZE QUESTION / NEW ROUND
  // --------------------------------------------------

  async function randomizeQuestion() {
    if (!gameId) {
      alert("Please create a game first.");
      return;
    }

    if (!category) {
      alert("Please select a category first.");
      return;
    }

    const categoryQuestions = questions[category];

    if (!categoryQuestions || categoryQuestions.length === 0) {
      alert("No questions found for this category.");
      return;
    }

    const randomIndex = Math.floor(
      Math.random() * categoryQuestions.length
    );

    const selectedQuestion = categoryQuestions[randomIndex];

    const startTime = new Date().toISOString();

    const { data, error } = await supabase
      .from("games")
      .update({
        category: category,
        question: selectedQuestion.question,
        correct_answer: selectedQuestion.answer,
        time_started: startTime,
        time_limit: 30,
        current_player: null,
        first_buzzed_player: null,
        answer_attempt: 0,
        round_status: "active",
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("RANDOMIZE ERROR:", error);
      alert("Could not start the round.");
      return;
    }

    console.log("NEW ROUND:", data);

    setQuestion(selectedQuestion.question);
    setCorrectAnswer(selectedQuestion.answer);
    setTimeLeft(30);
    setTimeUp(false);
    setCurrentPlayer(null);
    setRoundStatus("active");
  }

  // --------------------------------------------------
  // PLAYER BUZZER
  // --------------------------------------------------

  async function playerBuzzed(playerNumber) {
    if (!gameId) {
      alert("Please create or join a game first.");
      return;
    }

    if (!question) {
      alert("There is no active question.");
      return;
    }

    if (timeUp) {
      alert("Time is up.");
      return;
    }

    if (roundStatus === "wrong") {
      alert("Player 2 already has the chance to answer.");
      return;
    }

    if (currentPlayer !== null) {
      return;
    }

    const { data, error } = await supabase
      .from("games")
      .update({
        current_player: playerNumber,
        first_buzzed_player: playerNumber,
        round_status: "answering",
        answer_attempt: 1,
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("BUZZER ERROR:", error);
      alert("Could not record the buzzer.");
      return;
    }

    console.log("PLAYER BUZZED:", data);

    setCurrentPlayer(playerNumber);
    setRoundStatus("answering");
  }

  // --------------------------------------------------
  // CORRECT ANSWER
  // --------------------------------------------------

  async function handleCorrect() {
    if (!gameId || !currentPlayer) {
      return;
    }

    const { data, error } = await supabase
      .from("games")
      .update({
        round_status: "correct",
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("CORRECT ERROR:", error);
      alert("Could not mark the answer as correct.");
      return;
    }

    console.log("CORRECT:", data);

    setRoundStatus("correct");
  }

  // --------------------------------------------------
  // WRONG ANSWER
  // --------------------------------------------------

  async function handleWrong() {
    if (!gameId || !currentPlayer) {
      return;
    }

    // First answer is wrong.
    // The other player gets exactly one chance.

    if (
      roundStatus === "answering" &&
      currentPlayer !== null
    ) {
      const nextPlayer = currentPlayer === 1 ? 2 : 1;

      const { data, error } = await supabase
        .from("games")
        .update({
          round_status: "wrong",
          current_player: nextPlayer,
          answer_attempt: 2,
        })
        .eq("id", gameId)
        .select()
        .single();

      if (error) {
        console.error("FIRST WRONG ERROR:", error);
        alert("Could not record the wrong answer.");
        return;
      }

      console.log(
        "FIRST WRONG - NEXT PLAYER:",
        data
      );

      setCurrentPlayer(nextPlayer);
      setRoundStatus("wrong");

      return;
    }

    // Second answer is wrong.
    // Round is now completely finished.

    if (
      roundStatus === "wrong" &&
      currentPlayer !== null
    ) {
      const { data, error } = await supabase
        .from("games")
        .update({
          round_status: "no_correct_answer",
        })
        .eq("id", gameId)
        .select()
        .single();

      if (error) {
        console.error("SECOND WRONG ERROR:", error);
        alert("Could not finish the round.");
        return;
      }

      console.log(
        "NO CORRECT ANSWER:",
        data
      );

      setRoundStatus("no_correct_answer");
    }
  }

  // --------------------------------------------------
  // TIME UP
  // --------------------------------------------------

  async function handleTimeUp() {
    if (!gameId || !question) {
      return;
    }

    if (
      roundStatus === "time_up" ||
      roundStatus === "correct" ||
      roundStatus === "no_correct_answer" ||
      roundStatus === "ended"
    ) {
      return;
    }

    console.log("TIME'S UP");

    const { data, error } = await supabase
      .from("games")
      .update({
        round_status: "time_up",
        current_player: null,
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("TIME UP ERROR:", error);
      return;
    }

    console.log("ROUND TIME UP:", data);

    setTimeLeft(0);
    setTimeUp(true);
    setCurrentPlayer(null);
    setRoundStatus("time_up");
  }

  // --------------------------------------------------
  // SPIN AGAIN
  // --------------------------------------------------

  async function spinAgain() {
    if (!gameId) {
      alert("Please create a game first.");
      return;
    }

    if (!category) {
      alert("Please select a category first.");
      return;
    }

    const categoryQuestions = questions[category];

    if (
      !categoryQuestions ||
      categoryQuestions.length === 0
    ) {
      alert("No questions found for this category.");
      return;
    }

    const randomIndex = Math.floor(
      Math.random() * categoryQuestions.length
    );

    const selectedQuestion =
      categoryQuestions[randomIndex];

    const startTime = new Date().toISOString();

    console.log("STARTING NEXT ROUND...");

    const { data, error } = await supabase
      .from("games")
      .update({
        category: category,
        question: selectedQuestion.question,
        correct_answer: selectedQuestion.answer,
        time_started: startTime,
        time_limit: 30,
        current_player: null,
        first_buzzed_player: null,
        answer_attempt: 0,
        round_status: "active",
      })
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      console.error("SPIN AGAIN ERROR:", error);
      alert("Could not start the next round.");
      return;
    }

    console.log("NEXT ROUND:", data);

    setQuestion(selectedQuestion.question);
    setCorrectAnswer(selectedQuestion.answer);
    setTimeLeft(30);
    setTimeUp(false);
    setCurrentPlayer(null);
    setRoundStatus("active");
  }

  // --------------------------------------------------
  // END ROUND
  // --------------------------------------------------

  async function endRound() {
    if (!gameId) {
      return;
    }

    const { error } = await supabase
      .from("games")
      .update({
        round_status: "ended",
      })
      .eq("id", gameId);

    if (error) {
      console.error("END ROUND ERROR:", error);
      return;
    }

    setRoundStatus("ended");
  }

  // --------------------------------------------------
  // RESET GAME
  // --------------------------------------------------

  async function resetGame() {
    if (gameId) {
      const { error } = await supabase
        .from("games")
        .update({
          category: null,
          question: null,
          correct_answer: null,
          time_started: null,
          time_limit: 30,
          current_player: null,
          first_buzzed_player: null,
          answer_attempt: 0,
          round_status: "waiting",
        })
        .eq("id", gameId);

      if (error) {
        console.error("RESET GAME ERROR:", error);
        alert("Could not reset the game.");
        return;
      }
    }

    console.log("GAME RESET");

    setGameId(null);
    setGameCode("");
    setPlayerGameCode("");

    setCategory("");
    setQuestion("");
    setCorrectAnswer("");

    setTimeLeft(30);
    setTimeUp(false);

    setCurrentPlayer(null);
    setRoundStatus("waiting");

    setScreen("home");
  }

  // --------------------------------------------------
  // HOME SCREEN
  // --------------------------------------------------

  if (screen === "home") {
    return (
      <div className="app">
        <button
          className="fullscreen-button"
          onClick={toggleFullscreen}
        >
          {isFullscreen
            ? "⛶ EXIT FULL SCREEN"
            : "⛶ FULL SCREEN"}
        </button>

        <main className="home-page">
          <div className="home-content">
            <p className="eyebrow">AI EXPO 2026</p>

            <h1>
              SPIN THE WHEEL
              <br />
              <span>AI CHALLENGE</span>
            </h1>

            <p className="home-description">
              Test your AI knowledge. Spin the wheel.
              <br />
              Answer fast. Challenge yourself.
            </p>

            <div className="home-actions">
              <button
                className="primary-button"
                onClick={() => setScreen("host")}
              >
                HOST MODE
              </button>

              <button
                className="secondary-button"
                onClick={() => setScreen("player")}
              >
                PLAYER SCREEN
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------
  // HOST SCREEN
  // --------------------------------------------------

  if (screen === "host") {
    return (
      <div className="app">
        <nav className="navbar">
          <div className="logo">
            AI <span>EXPO</span> 2026
          </div>

          {gameId && (
            <div className="host-nav-code">
              <span>GAME CODE</span>
              <strong>{gameCode}</strong>
            </div>
          )}

          <button
            className="nav-back"
            onClick={() => setScreen("home")}
          >
            ← BACK
          </button>
        </nav>

        <main className="host-page host-dashboard">

          {/* HEADER */}

          <div className="host-heading">
            <div>
              <p className="eyebrow">AI EXPO 2026</p>

              <h1>
                HOST <span>MODE</span>
              </h1>
            </div>

            <p className="host-heading-description">
              Control the challenge from this screen.
            </p>
          </div>

          {/* CREATE GAME */}

          {!gameId && (
            <section className="host-card create-game-card">
              <div>
                <div className="card-label">
                  GAME SESSION
                </div>

                <h2>Create a new game</h2>

                <p className="muted">
                  Create one game code and keep it for all rounds.
                </p>
              </div>

              <button
                className="primary-button create-game-button"
                onClick={createGame}
              >
                CREATE GAME
              </button>
            </section>
          )}

          {/* ACTIVE GAME */}

          {gameId && (
            <>

              {/* CATEGORY */}

              <section className="host-card category-card">

                <div className="section-heading">
                  <div>
                    <div className="card-label">
                      CATEGORY
                    </div>

                    <h2>Select Difficulty</h2>
                  </div>

                  <button
                    className="randomize-button"
                    onClick={randomizeQuestion}
                    disabled={!category}
                  >
                    RANDOMIZE QUESTION
                  </button>
                </div>

                <div className="category-buttons">

                  <button
                    className={
                      category === "beginner"
                        ? "category-button beginner selected"
                        : "category-button beginner"
                    }
                    onClick={() =>
                      selectCategory("beginner")
                    }
                  >
                    <strong>BEGINNER</strong>
                  </button>

                  <button
                    className={
                      category === "intermediate"
                        ? "category-button intermediate selected"
                        : "category-button intermediate"
                    }
                    onClick={() =>
                      selectCategory("intermediate")
                    }
                  >
                    <strong>INTERMEDIATE</strong>
                  </button>

                  <button
                    className={
                      category === "challenge"
                        ? "category-button challenge selected"
                        : "category-button challenge"
                    }
                    onClick={() =>
                      selectCategory("challenge")
                    }
                  >
                    <strong>CHALLENGE</strong>
                  </button>

                </div>

              </section>

              {/* QUESTION */}

              <section className="host-card question-card">

                <div className="question-top">

                  <div>
                    <div className="card-label">
                      {category
                        ? category.toUpperCase()
                        : "WAITING FOR CATEGORY"}
                    </div>

                    <div className="question-heading">
                      QUESTION
                    </div>
                  </div>

                  <div
                    className={
                      timeLeft <= 5
                        ? "timer danger"
                        : "timer"
                    }
                  >
                    {timeLeft}
                  </div>

                </div>

                {!question && (
                  <div className="question-empty">
                    <div className="waiting-icon">
                      ?
                    </div>

                    <div>
                      <strong>
                        WAITING FOR QUESTION
                      </strong>

                      <p>
                        Select a category and randomize the question.
                      </p>
                    </div>
                  </div>
                )}

                {question && (
                  <div className="question-content">

                    <div className="question-text">
                      {question}
                    </div>

                    {currentPlayer &&
                      roundStatus !== "correct" &&
                      roundStatus !== "no_correct_answer" &&
                      roundStatus !== "time_up" &&
                      roundStatus !== "ended" && (
                        <div className="player-turn">
                          🎤 PLAYER {currentPlayer}'S TURN
                        </div>
                      )}

                    {roundStatus === "time_up" && (
                      <div className="status-box time">
                        ⏰ TIME'S UP
                        <span>NO ANSWER</span>
                      </div>
                    )}

                    {roundStatus === "correct" && (
                      <div className="status-box correct">
                        ✓ CORRECT!
                        <span>ROUND COMPLETE</span>
                      </div>
                    )}

                    {roundStatus === "wrong" && (
                      <div className="status-box wrong">
                        ✕ WRONG ANSWER
                        <span>
                          PLAYER {currentPlayer} GETS A CHANCE
                        </span>
                      </div>
                    )}

                    {roundStatus === "no_correct_answer" && (
                      <div className="status-box wrong">
                        ✕ NO CORRECT ANSWER
                        <span>ROUND COMPLETE</span>
                      </div>
                    )}

                    {roundStatus === "ended" && (
                      <div className="status-box">
                        ROUND COMPLETE
                      </div>
                    )}

                    {!currentPlayer &&
                      roundStatus === "active" &&
                      !timeUp && (
                        <div className="waiting-player">
                          Waiting for a player to buzz...
                        </div>
                      )}

                  </div>
                )}

                {correctAnswer && (
                  <div className="answer-preview">
                    <div className="card-label">
                      CORRECT ANSWER
                    </div>

                    <div className="answer-text">
                      {correctAnswer}
                    </div>
                  </div>
                )}

              </section>

              {/* PLAYER / ANSWER CONTROLS */}

              {question &&
                roundStatus === "active" &&
                !timeUp && (

                  <section className="host-card control-card">

                    <div className="control-title">
                      WHO BUZZED?
                    </div>

                    <div className="buzzer-controls">

                      <button
                        className="buzzer-button"
                        onClick={() =>
                          playerBuzzed(1)
                        }
                        disabled={currentPlayer !== null}
                      >
                        🎤 PLAYER 1
                      </button>

                      <button
                        className="buzzer-button"
                        onClick={() =>
                          playerBuzzed(2)
                        }
                        disabled={currentPlayer !== null}
                      >
                        🎤 PLAYER 2
                      </button>

                    </div>

                  </section>
                )}

              {question &&
                (roundStatus === "answering" ||
                  roundStatus === "wrong") && (

                  <section className="host-card control-card">

                    <div className="control-title">
                      PLAYER {currentPlayer} — ANSWER
                    </div>

                    <div className="answer-controls">

                      <button
                        className="correct-button"
                        onClick={handleCorrect}
                        disabled={!currentPlayer}
                      >
                        ✓ CORRECT
                      </button>

                      <button
                        className="wrong-button"
                        onClick={handleWrong}
                        disabled={!currentPlayer}
                      >
                        ✕ WRONG
                      </button>

                    </div>

                  </section>
                )}

              {/* ROUND ACTIONS */}

              {question && (
                <section className="round-actions">

                  <button
                    className="end-round-button"
                    onClick={endRound}
                    disabled={roundStatus === "ended"}
                  >
                    END ROUND
                  </button>

                  <button
                    className="spin-again-button"
                    onClick={spinAgain}
                  >
                    ↻ SPIN AGAIN
                  </button>

                </section>
              )}

              {/* RESET */}

              <div className="reset-area">

                <button
                  className="reset-button"
                  onClick={resetGame}
                >
                  RESET GAME
                </button>

              </div>

            </>
          )}

        </main>
      </div>
    );
  }

  // --------------------------------------------------
  // PLAYER SCREEN
  // --------------------------------------------------

  if (screen === "player") {
    return (
      <div className="app">

        <nav className="navbar">
          <div className="logo">
            AI <span>EXPO</span> 2026
          </div>

          <button
            className="nav-back"
            onClick={() => setScreen("home")}
          >
            ← BACK
          </button>
        </nav>

        <main className="player-page">

          <div className="page-heading">

            <p className="eyebrow">
              AI EXPO 2026
            </p>

            <h1>
              PLAYER <span>SCREEN</span>
            </h1>

            <p>
              Watch the question and answer when you are
              called.
            </p>

          </div>

          {/* JOIN */}

          {!gameId && (
            <div className="join-card">

              <h3>JOIN GAME</h3>

              <input
                className="game-input"
                type="text"
                maxLength="4"
                placeholder="A7K2"
                value={playerGameCode}
                onChange={(event) =>
                  setPlayerGameCode(
                    event.target.value.toUpperCase()
                  )
                }
              />

              <button
                className="join-button"
                onClick={joinGame}
              >
                JOIN GAME
              </button>

            </div>
          )}

          {/* CONNECTED PLAYER */}

          {gameId && (
            <div className="player-game">

              <div className="join-card">

                <p className="muted">
                  ✓ CONNECTED TO GAME
                </p>

                <div className="game-code">
                  {playerGameCode}
                </div>

              </div>

              {question ? (

                <section className="host-card question-card">

                  <div className="question-top">

                    <div>

                      <div className="card-label">
                        CATEGORY
                      </div>

                      <div className="selected-category">
                        {category
                          ? category.toUpperCase()
                          : "—"}
                      </div>

                    </div>

                    <div
                      className={
                        timeLeft <= 5
                          ? "timer danger"
                          : "timer"
                      }
                    >
                      {timeLeft}
                    </div>

                  </div>

                  <div className="question-content">

                    <div className="card-label">
                      QUESTION
                    </div>

                    <div className="question-text">
                      {question}
                    </div>

                    {/* PLAYER TURN */}

                    {currentPlayer &&
                      roundStatus !== "correct" &&
                      roundStatus !== "no_correct_answer" &&
                      roundStatus !== "time_up" &&
                      roundStatus !== "ended" && (
                        <div className="time-up">
                          🎤 PLAYER {currentPlayer}'S TURN
                        </div>
                      )}

                    {/* CORRECT */}

                    {roundStatus === "correct" && (
                      <div className="time-up">
                        ✓ CORRECT!
                        <br />
                        ROUND COMPLETE
                      </div>
                    )}

                    {/* FIRST WRONG */}

                    {roundStatus === "wrong" && (
                      <div className="time-up">
                        ✕ WRONG ANSWER
                        <br />
                        PLAYER {currentPlayer} GETS A
                        CHANCE
                      </div>
                    )}

                    {/* NO CORRECT */}

                    {roundStatus ===
                      "no_correct_answer" && (
                      <div className="time-up">
                        ✕ NO CORRECT ANSWER
                        <br />
                        ROUND COMPLETE
                      </div>
                    )}

                    {/* TIME UP */}

                    {roundStatus === "time_up" && (
                      <div className="time-up">
                        ⏰ TIME'S UP
                        <br />
                        NO ANSWER
                      </div>
                    )}

                    {/* END */}

                    {roundStatus === "ended" && (
                      <div className="time-up">
                        ROUND COMPLETE
                      </div>
                    )}

                    {/* WAITING */}

                    {!currentPlayer &&
                      roundStatus === "active" &&
                      !timeUp && (
                        <div className="muted">
                          Waiting for a player to buzz...
                        </div>
                      )}

                  </div>

                  {/* CORRECT ANSWER - PLAYER SEES IT ONLY AFTER ROUND ENDS */}

                  {(roundStatus === "correct" ||
                    roundStatus === "no_correct_answer" ||
                    roundStatus === "time_up" ||
                    roundStatus === "ended") &&
                    correctAnswer && (

                      <div className="answer-preview">

                        <div className="card-label">
                          CORRECT ANSWER
                        </div>

                        <div className="answer-text">
                          {correctAnswer}
                        </div>

                      </div>
                    )}

                </section>

              ) : (

                <section className="host-card question-card">

                  <div className="question-empty">

                    <div className="card-label">
                      WAITING FOR QUESTION
                    </div>

                    <p>
                      The host is preparing the next
                      challenge...
                    </p>

                  </div>

                </section>
              )}

            </div>
          )}

        </main>
      </div>
    );
  }

  return null;
}

export default App;
