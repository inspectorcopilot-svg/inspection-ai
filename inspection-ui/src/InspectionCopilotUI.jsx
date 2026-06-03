/*****************************************************************

INSPECTION COPILOT UI

PURPOSE
This component is the main field-facing interface for the inspection
co-pilot. It handles inspection mode, review mode, completion mode,
voice observations, voice commands, photo attachment, follow-up answers,
priority override, and copy/paste report blocks.

TABLE OF CONTENTS
1. Configuration
2. Dropdown Options and Priority Styling
3. Main Component
4. UI State
5. React References
6. Application Lifecycle
7. Computed Values
8. Backend API Functions
9. Voice Command System
10. Observation Processing
11. Follow-Up Questions
12. Voice Input Controls
13. Photo Management
14. Review Workflow and Priority Override
15. Completion Workflow
16. Session Save / Load
17. Copy / Export Utilities
18. Authentication
19. Settings
20. UI Render

*****************************************************************/

import { useEffect, useMemo, useRef, useState } from "react"


/*****************************************************************/
/* 1. CONFIGURATION */
/*****************************************************************/

// Use the same host that served the UI so phones and tablets can reach the
// Inspection Co-Pilot backend running on the inspector's local network.
// Hosted builds can point at a deployed backend through VITE_API_BASE_URL.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`
).replace(/\/+$/, "")

/*****************************************************************/
/* 2. DROPDOWN OPTIONS AND PRIORITY STYLING */
/*****************************************************************/

// Inspection areas shown in the Area dropdown and used by voice commands.
const AREA_OPTIONS = [
  "Kitchen",
  "Bathroom",
  "Basement",
  "Garage",
  "Exterior",
  "Attic",
  "Crawlspace",
  "Laundry",
  "Living Area",
]

// Components shown in the Component dropdown and used by voice commands.
const COMPONENT_OPTIONS = [
  "Electrical Outlet",
  "GFCI Outlet",
  "Electrical Panel",
  "Ceiling",
  "Plumbing Fixture",
  "Furnace Filter",
  "Foundation Wall",
  "Roof Surface",
  "Window",
  "Door",
]

// Priority presets used by the inspector override panel.
const PRIORITY_OPTIONS = [
  { label: "LOW", score: 25 },
  { label: "MEDIUM", score: 50 },
  { label: "HIGH", score: 70 },
  { label: "CRITICAL", score: 90 },
]

// Border/background/text classes for each priority level.
const levelStyles = {
  CRITICAL: "border-red-500 bg-red-50 text-red-800",
  HIGH: "border-orange-500 bg-orange-50 text-orange-800",
  MEDIUM: "border-yellow-500 bg-yellow-50 text-yellow-800",
  LOW: "border-slate-300 bg-slate-50 text-slate-700",
}

// Small badge colors used beside the active finding score.
const badgeStyles = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-slate-100 text-slate-700",
}

const TUTORIAL_STORAGE_KEY = "inspection-copilot-tutorial-complete"

const TUTORIAL_STEPS = [
  {
    title: "Welcome to Inspection Co-Pilot",
    body: "This app assists your inspection workflow. You stay in control of every finding. The walkthrough is optional and can be replayed later from Settings.",
  },
  {
    title: "Start a Titled Inspection",
    body: "Use New Inspection to enter a short working title, usually the property address. This makes the inspection easy to find when you load it on the desktop.",
  },
  {
    title: "Choose the Inspection Target",
    body: "Use Area and Component to tell the co-pilot what you are inspecting. This adds field context to each observation.",
  },
  {
    title: "Record Observations",
    body: "Speak or type what you observe, then submit it. The co-pilot suggests a finding, priority, follow-up questions, and photo guidance for your review.",
  },
  {
    title: "Attach Photos",
    body: "Use Take Photo on an active finding. The Photo Gallery keeps attached photos together so you can verify documentation before completion.",
  },
  {
    title: "Review Findings",
    body: "Open Review Mode to approve, reject, or override each suggested finding. Only inspector-approved findings become copy/paste blocks.",
  },
  {
    title: "Watch Save And Connection Status",
    body: "The status bar shows whether the app is online and when it last saved. Changes save after important actions, and you can also tap Save.",
  },
  {
    title: "Complete And Move To Desktop",
    body: "Use Complete for readiness checks. Save for Desktop, then load the titled inspection on the computer with your preferred report software and copy the approved blocks.",
  },
]

/*****************************************************************/
/* 3. MAIN COMPONENT */
/*****************************************************************/

export default function InspectionCopilotUI() {


/*****************************************************************/
/* 4. UI STATE */
/*****************************************************************/


// Main workflow mode: inspection, review, or complete.
const [mode, setMode] = useState("inspection")


// Current backend inspection session.
const [sessionId, setSessionId] = useState(null)
const [inspectionTitle, setInspectionTitle] = useState("Untitled Inspection")
const [inspectionTitleDraft, setInspectionTitleDraft] = useState("Untitled Inspection")
const [titleSaving, setTitleSaving] = useState(false)
const [newInspectionTitle, setNewInspectionTitle] = useState("")
const [showNewInspectionPanel, setShowNewInspectionPanel] = useState(false)

// Current inspection target selected by the inspector.
const [area, setArea] = useState("Kitchen")
const [component, setComponent] = useState("Electrical Outlet")

// Text captured from typing or speech before being submitted.
const [observation, setObservation] = useState("")

// Pending findings currently in the inspection/review queue.
const [issues, setIssues] = useState([])
// All findings retained for inspection documentation QA, including reviewed items.
const [allIssues, setAllIssues] = useState([])
const [activeIssue, setActiveIssue] = useState(null)
const [copilotMessage, setCopilotMessage] = useState(
  "Waiting for inspection observation."
)

// Completion-mode outputs from the backend.
const [coverage, setCoverage] = useState(null)
const [reportBlocks, setReportBlocks] = useState([])
const [loading, setLoading] = useState(false)


// Voice recognition state.
const [isListening, setIsListening] = useState(false)
const [voiceSupported, setVoiceSupported] = useState(true)
const [autoSubmitVoice, setAutoSubmitVoice] = useState(true)
const [lastVoiceCommand, setLastVoiceCommand] = useState("")
const [followUpAnswer, setFollowUpAnswer] = useState("")
const [photoUploading, setPhotoUploading] = useState(false)
const [selectedPhoto, setSelectedPhoto] = useState(null)
const [reviewedPhotoIds, setReviewedPhotoIds] = useState([])


// Review-mode priority override controls.
const [showOverridePanel, setShowOverridePanel] = useState(false)
const [overrideScore, setOverrideScore] = useState(70)


/*****************************************************************/
/* SAVE / LOAD STATE */
/*****************************************************************/

// Current save status shown in UI.
const [saveStatus, setSaveStatus] = useState("Not Saved")

// Timestamp of last successful save.
const [lastSavedAt, setLastSavedAt] = useState(null)

// List of saved inspections returned from backend.
const [savedSessions, setSavedSessions] = useState([])
const [savedSessionSearch, setSavedSessionSearch] = useState("")

// Controls visibility of Load Session panel.
const [showLoadPanel, setShowLoadPanel] = useState(false)
const [activeMobilePanel, setActiveMobilePanel] = useState(null)

// Manual cloud restore stays separate from the normal local Load action.
const [cloudRestoreInspectionId, setCloudRestoreInspectionId] = useState("")
const [cloudRestoreStatus, setCloudRestoreStatus] = useState("")
const [cloudRestoreLoading, setCloudRestoreLoading] = useState(false)

// Enables/disables timed auto-save.
const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

// Controls the startup recovery prompt.
const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false)

// Stores the most recent saved inspection session.
const [latestSavedSession, setLatestSavedSession] = useState(null)
const [coverageReviewed, setCoverageReviewed] = useState(false)
const [isOnline, setIsOnline] = useState(navigator.onLine)

/*****************************************************************/
/* AUTH STATE */
/*****************************************************************/

// Local login state. Later this can become real token-based auth.
const [isAuthenticated, setIsAuthenticated] = useState(false)
const [loginUsername, setLoginUsername] = useState("")
const [loginPassword, setLoginPassword] = useState("")
const [loginError, setLoginError] = useState("")
const [currentUser, setCurrentUser] = useState(null)
const [showProfileMenu, setShowProfileMenu] = useState(false)
const [showProfilePanel, setShowProfilePanel] = useState(false)
const [tutorialStep, setTutorialStep] = useState(null)

/*****************************************************************/
/* SETTINGS STATE */
/*****************************************************************/

// Controls whether the Settings drawer/panel is visible.
const [showSettingsPanel, setShowSettingsPanel] = useState(false)

// Tracks whether settings are being loaded or saved.
const [settingsLoading, setSettingsLoading] = useState(false)

// Status message for settings save/load actions.
const [settingsStatus, setSettingsStatus] = useState("")
const [activeSettingsHelp, setActiveSettingsHelp] = useState(null)
const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches || false
)

// User-configurable app preferences.
// These values mirror users/local_user/settings.json on the backend.
const [settings, setSettings] = useState({
  inspector_name: "",
  default_mode: "inspection",
  appearance_theme: "system",

  voice_auto_submit: true,
  voice_language: "en-US",
  voice_sensitivity: "normal",

  require_photo_for_critical: false,
  require_photo_for_high: false,

  auto_save_enabled: true,
  auto_save_interval_seconds: 30,
  restore_previous_session: true,

  show_ai_reasoning: true,
  show_confidence_score: true,
  learn_from_overrides: true,
})


  /*****************************************************************/
  /* 5. REACT REFERENCES */
  /*****************************************************************/

  // Refs keep latest state available inside async speech callbacks.
  const recognitionRef = useRef(null)
  const sessionIdRef = useRef(null)
  const areaRef = useRef(area)
  const componentRef = useRef(component)
  const activeIssueRef = useRef(activeIssue)
  const voiceModeRef = useRef("observation")
  const photoInputRef = useRef(null)


  /*****************************************************************/
  /* 6. APPLICATION LIFECYCLE */
  /*****************************************************************/

  // Keep session ref synced so async handlers always use the latest session.
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])


  // Keep current area ref synced for voice/backend submissions.
  useEffect(() => {
    areaRef.current = area
  }, [area])


  // Keep current component ref synced for voice/backend submissions.
  useEffect(() => {
    componentRef.current = component
  }, [component])

  // Follow the operating-system theme while the user preference is set to System.
  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)")

    if (!mediaQuery) return

    const updateSystemTheme = (event) => {
      setSystemPrefersDark(event.matches)
    }

    mediaQuery.addEventListener?.("change", updateSystemTheme)

    return () => {
      mediaQuery.removeEventListener?.("change", updateSystemTheme)
    }
  }, [])

  useEffect(() => {
    const preference = settings.appearance_theme || "system"
    const useDarkTheme =
      preference === "dark" ||
      (preference === "system" && systemPrefersDark)

    document.documentElement.classList.toggle("dark", useDarkTheme)
  }, [settings.appearance_theme, systemPrefersDark])

  // Report whether the phone/tablet can currently reach the local backend.
  useEffect(() => {
    let cancelled = false

    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`, {
          cache: "no-store",
        })

        if (!cancelled) {
          setIsOnline(response.ok)
        }
      } catch {
        if (!cancelled) {
          setIsOnline(false)
        }
      }
    }

    checkConnection()
    const timer = setInterval(checkConnection, 10000)
    window.addEventListener("online", checkConnection)
    window.addEventListener("offline", checkConnection)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener("online", checkConnection)
      window.removeEventListener("offline", checkConnection)
    }
  }, [])

  useEffect(() => {
    const warnBeforeClose = (event) => {
      if (isOnline || (!sessionId && !observation.trim())) return

      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", warnBeforeClose)

    return () => {
      window.removeEventListener("beforeunload", warnBeforeClose)
    }
  }, [isOnline, sessionId, observation])


  // Keep active finding ref synced and update override slider when selected issue changes.
  useEffect(() => {
    activeIssueRef.current = activeIssue
    if (activeIssue?.priority_score) {
      setOverrideScore(activeIssue.priority_score)
    }
  }, [activeIssue])


  // Create a new backend inspection session when the app first loads.
  useEffect(() => {
    createSession()
  }, [])


  /*****************************************************************/
  /* CHECK FOR RECOVERABLE SESSION ON STARTUP */
  /*****************************************************************/

  useEffect(() => {
    if (!isAuthenticated) return

    loadSavedSessions(true)
  }, [isAuthenticated])


  /*****************************************************************/
  /* AUTO-SAVE TIMER */
  /*****************************************************************/

  useEffect(() => {
    if (!isAuthenticated) return
    if (!autoSaveEnabled) return
    if (!sessionId) return
    if (inspectionTitle === "Untitled Inspection" && allIssues.length === 0) return

    const timer = setInterval(() => {
      saveSession(true)
    }, (settings.auto_save_interval_seconds || 30) * 1000)

    return () => clearInterval(timer)
  }, [isAuthenticated, sessionId, inspectionTitle, allIssues.length, autoSaveEnabled, settings.auto_save_interval_seconds])


  // Configure browser speech recognition for observations, commands, and follow-up answers.
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceSupported(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = settings.voice_language || "en-US"

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript

      if (voiceModeRef.current === "follow_up") {
        setFollowUpAnswer(transcript)

        if (activeIssueRef.current) {
          await submitFollowUpAnswer(activeIssueRef.current, transcript)
        }

        return
      }

      setObservation(transcript)

      const handledCommand = await handleVoiceCommand(transcript)

      if (handledCommand) {
        setObservation("")
        return
      }

      if (autoSubmitVoice && mode === "inspection") {
        await submitObservation(transcript)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      voiceModeRef.current = "observation"
    }

    recognition.onerror = () => {
      setIsListening(false)
      voiceModeRef.current = "observation"
    }

    recognitionRef.current = recognition
  }, [autoSubmitVoice, mode, settings.voice_language])

  useEffect(() => {
    setInspectionTitleDraft(inspectionTitle)
  }, [inspectionTitle])


  /*****************************************************************/
  /* 7. COMPUTED VALUES */
  /*****************************************************************/

  // Always show highest-priority findings first.
  const sortedIssues = useMemo(() => {
    return [...issues].sort(
      (a, b) => (b.priority_score || 0) - (a.priority_score || 0)
    )
  }, [issues])


  // Sidebar counts for quick field status.
  const counts = useMemo(() => {
    return {
      critical: issues.filter((i) => i.priority_level === "CRITICAL").length,
      high: issues.filter((i) => i.priority_level === "HIGH").length,
      pending: issues.length,
    }
  }, [issues])

  // All attached photos remain available for workflow QA after review decisions.
  const galleryPhotos = useMemo(() => {
    return allIssues.flatMap((issue) =>
      (issue.photos || []).map((photo) => ({
        photo,
        issueId: issue.id,
        component: issue.component,
        priorityLevel: issue.priority_level,
      }))
    )
  }, [allIssues])

  // Display co-pilot guidance as short field-friendly lines.
  const copilotMessageLines = useMemo(() => {
    return copilotMessage
      .split(/\n+|(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }, [copilotMessage])

  const missingRequiredPhotoIssues = useMemo(() => {
    return allIssues.filter((issue) => {
      if (issue.status === "rejected") return false
      if (issue.photos?.length > 0) return false

      return (
        (settings.require_photo_for_critical &&
          issue.priority_level === "CRITICAL") ||
        (settings.require_photo_for_high &&
          issue.priority_level === "HIGH")
      )
    })
  }, [
    allIssues,
    settings.require_photo_for_critical,
    settings.require_photo_for_high,
  ])

  const allAttachedPhotosReviewed = useMemo(() => {
    return galleryPhotos.every((galleryPhoto) =>
      reviewedPhotoIds.includes(galleryPhoto.photo.photo_id)
    )
  }, [galleryPhotos, reviewedPhotoIds])

  const completionReadiness = useMemo(() => {
    const items = [
      {
        label: "Pending findings reviewed",
        ready: issues.length === 0,
      },
      {
        label: "Coverage gaps reviewed",
        ready:
          !coverage ||
          coverage.missing_areas?.length === 0 ||
          coverageReviewed,
      },
      {
        label: "Required photos attached",
        ready: missingRequiredPhotoIssues.length === 0,
      },
      {
        label: "Attached photos verified",
        ready: allAttachedPhotosReviewed,
      },
    ]

    return {
      items,
      ready: items.every((item) => item.ready),
    }
  }, [
    issues.length,
    coverage,
    coverageReviewed,
    missingRequiredPhotoIssues.length,
    allAttachedPhotosReviewed,
  ])

  const reviewComplete = mode === "review" && issues.length === 0

  const filteredSavedSessions = useMemo(() => {
    const search = savedSessionSearch.trim().toLowerCase()

    if (!search) return savedSessions

    return savedSessions.filter((session) =>
      (session.inspection_title || "Untitled Inspection")
        .toLowerCase()
        .includes(search)
    )
  }, [savedSessions, savedSessionSearch])


  // Inspector display name used only for app personalization.
  // Do not place this in report blocks or completion outputs.
  const inspectorDisplayName =
    settings.inspector_name?.trim() ||
    currentUser ||
    "Local Inspector"

  const startTutorial = () => {
    setShowProfileMenu(false)
    setTutorialStep(0)
  }

  const completeTutorial = () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true")
    setTutorialStep(null)
  }

  const markWorkflowSaved = () => {
    setSaveStatus("Saved")
    setLastSavedAt(new Date().toISOString())
  }

  const showMobilePanel = (panel) => {
    setActiveMobilePanel((current) => (current === panel ? null : panel))
    setShowProfileMenu(false)
    setShowProfilePanel(panel === "profile")
    setShowSettingsPanel(panel === "settings")
    setShowLoadPanel(panel === "load")
    setShowNewInspectionPanel(false)
    setShowOverridePanel(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const closeMobilePanels = () => {
    setActiveMobilePanel(null)
    setShowProfileMenu(false)
    setShowProfilePanel(false)
    setShowSettingsPanel(false)
    setShowLoadPanel(false)
  }


  /*****************************************************************/
  /* 8. BACKEND API FUNCTIONS */
  /*****************************************************************/

  // Creates a new inspection session on the FastAPI backend.
  const createSession = async (title = "Untitled Inspection") => {
    const res = await fetch(`${API_BASE}/workflow/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspection_title: title,
      }),
    })

    const data = await res.json()
    setSessionId(data.session_id)
    setInspectionTitle(data.inspection_title || title)
    setInspectionTitleDraft(data.inspection_title || title)
  }

  // Renames the current working inspection session label.
  const updateInspectionTitle = async () => {
    const nextTitle = inspectionTitleDraft.trim() || "Untitled Inspection"

    setInspectionTitle(nextTitle)
    setInspectionTitleDraft(nextTitle)

    if (!sessionIdRef.current) return

    try {
      setTitleSaving(true)

      const response = await fetch(
        `${API_BASE}/workflow/session/${sessionIdRef.current}/title`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspection_title: nextTitle,
          }),
        }
      )

      if (!response.ok) {
        throw new Error("Title update failed")
      }

      const data = await response.json()
      setInspectionTitle(data.inspection_title || nextTitle)
      setInspectionTitleDraft(data.inspection_title || nextTitle)
      setSaveStatus("Saved")
      setLastSavedAt(data.saved_at || new Date().toISOString())
      await loadSavedSessions()
    } catch {
      setCopilotMessage("Could not update the inspection title. Try Save from the menu.")
    } finally {
      setTitleSaving(false)
    }
  }

  // Starts a clean workflow session with an inspector-friendly title.
  const startNewInspection = async () => {
    const title = newInspectionTitle.trim()

    if (!title) return

    await createSession(title)

    setIssues([])
    setAllIssues([])
    setActiveIssue(null)
    setCoverage(null)
    setReportBlocks([])
    setSelectedPhoto(null)
    setReviewedPhotoIds([])
    setObservation("")
    setFollowUpAnswer("")
    setShowOverridePanel(false)
    setShowLoadPanel(false)
    setShowRecoveryPrompt(false)
    setCoverageReviewed(false)
    setLatestSavedSession(null)
    setMode("inspection")
    setSaveStatus("Not Saved")
    setLastSavedAt(null)
    setCopilotMessage(`New inspection started: ${title}.`)
    setNewInspectionTitle("")
    setShowNewInspectionPanel(false)
  }


  /*****************************************************************/
  /* 9. VOICE COMMAND SYSTEM */
  /*****************************************************************/

  // Standardizes speech text before command matching.
  const normalizeSpeech = (text) => {
    return text.toLowerCase().trim()
  }


  // Detects whether speech mentioned one of the supported areas.
  const findAreaFromSpeech = (text) => {
    return AREA_OPTIONS.find((option) =>
      text.includes(option.toLowerCase())
    )
  }


  // Detects whether speech mentioned one of the supported components.
  const findComponentFromSpeech = (text) => {
    return COMPONENT_OPTIONS.find((option) =>
      text.includes(option.toLowerCase())
    )
  }


  // Converts numeric override score into user-facing severity label.
  const scoreToLevel = (score) => {
    if (score >= 80) return "CRITICAL"
    if (score >= 60) return "HIGH"
    if (score >= 40) return "MEDIUM"
    return "LOW"
  }


  // Handles voice commands such as changing area, starting review, approving, rejecting, or taking photos.
  // Returns true when the spoken text was a command and should NOT be submitted as an observation.
  /*****************************************************************/
  /* VOICE COMMAND MATCHING */
  /*****************************************************************/

  // Matches voice commands according to the inspector's selected sensitivity.
  // strict: exact command phrases only.
  // normal: current includes-based behavior.
  // flexible: allows more conversational command phrases.
  const voiceCommandMatches = (transcript, phrases, flexiblePhrases = []) => {
    const text = normalizeSpeech(transcript)
    const sensitivity = settings.voice_sensitivity || "normal"
    const allPhrases = [...phrases, ...flexiblePhrases]

    if (sensitivity === "strict") {
      return phrases.some((phrase) => text === phrase.toLowerCase())
    }

    if (sensitivity === "normal") {
      return phrases.some((phrase) =>
        text.includes(phrase.toLowerCase())
      )
    }

    if (sensitivity === "flexible") {
      return allPhrases.some((phrase) =>
        text.includes(phrase.toLowerCase())
      )
    }

    return phrases.some((phrase) =>
      text.includes(phrase.toLowerCase())
    )
  }


  // Handles voice commands such as changing area, starting review, approving, rejecting, or taking photos.
  // Returns true when the spoken text was a command and should NOT be submitted as an observation.
  const handleVoiceCommand = async (spokenText) => {
    const text = normalizeSpeech(spokenText)

    const isAreaCommand = voiceCommandMatches(
      text,
      [
        "move to",
        "go to",
        "switch to",
        "now in",
        "current area",
      ],
      [
        "moving to",
        "heading to",
        "walking to",
        "working in",
        "change area to",
        "set area to",
        "let's go to",
        "lets go to",
      ]
    )

    if (isAreaCommand) {
      const detectedArea = findAreaFromSpeech(text)

      if (detectedArea) {
        setArea(detectedArea)
        setLastVoiceCommand(`Area changed to ${detectedArea}`)
        setCopilotMessage(`Area updated to ${detectedArea}. Continue inspection.`)
        return true
      }
    }

    const isComponentCommand = voiceCommandMatches(
      text,
      [
        "inspect",
        "inspecting",
        "component",
        "change component",
        "looking at",
      ],
      [
        "set component to",
        "change to",
        "checking",
        "working on",
        "looking over",
      ]
    )

    if (isComponentCommand) {
      const detectedComponent = findComponentFromSpeech(text)

      if (detectedComponent) {
        setComponent(detectedComponent)
        setLastVoiceCommand(`Component changed to ${detectedComponent}`)
        setCopilotMessage(
          `Component updated to ${detectedComponent}. Continue inspection.`
        )
        return true
      }
    }

    if (
      voiceCommandMatches(
        text,
        [
          "finish inspection",
          "complete inspection",
          "end inspection",
        ],
        [
          "inspection complete",
          "wrap up inspection",
          "done inspecting",
          "finished inspection",
          "end this inspection",
        ]
      )
    ) {
      await enterReviewMode()
      setLastVoiceCommand("Review mode started")
      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "start review",
          "review findings",
          "review mode",
        ],
        [
          "begin review",
          "go to review",
          "start reviewing",
          "let's review",
          "lets review",
        ]
      )
    ) {
      await enterReviewMode()
      setLastVoiceCommand("Review mode started")
      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "back to inspection",
          "inspection mode",
          "continue inspection",
        ],
        [
          "go back to inspection",
          "return to inspection",
          "keep inspecting",
          "continue inspecting",
        ]
      )
    ) {
      setMode("inspection")
      setCopilotMessage("Inspection mode active. Continue collecting observations.")
      setLastVoiceCommand("Inspection mode started")
      return true
    }

    if (
      voiceCommandMatches(text, ["override critical"], ["make critical", "set critical"])
    ) {
      await applyPriorityOverride(90)
      setLastVoiceCommand("Priority overridden to CRITICAL")
      return true
    }

    if (
      voiceCommandMatches(text, ["override high"], ["make high", "set high"])
    ) {
      await applyPriorityOverride(70)
      setLastVoiceCommand("Priority overridden to HIGH")
      return true
    }

    if (
      voiceCommandMatches(text, ["override medium"], ["make medium", "set medium"])
    ) {
      await applyPriorityOverride(50)
      setLastVoiceCommand("Priority overridden to MEDIUM")
      return true
    }

    if (
      voiceCommandMatches(text, ["override low"], ["make low", "set low"])
    ) {
      await applyPriorityOverride(25)
      setLastVoiceCommand("Priority overridden to LOW")
      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "approve finding",
          "approve issue",
          "approve",
        ],
        [
          "approve that",
          "approve this",
          "that finding looks good",
          "this finding looks good",
          "looks good",
          "good to go",
        ]
      )
    ) {
      if (activeIssueRef.current && mode === "review") {
        setLastVoiceCommand("Approved current finding")
        await decideIssue(activeIssueRef.current, "approved")
      } else if (mode !== "review") {
        setCopilotMessage("Switch to Review Mode before approving findings.")
      } else {
        setCopilotMessage("No active finding selected to approve.")
      }

      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "reject finding",
          "reject issue",
          "reject",
        ],
        [
          "reject that",
          "reject this",
          "remove finding",
          "remove this finding",
          "not a finding",
          "discard finding",
        ]
      )
    ) {
      if (activeIssueRef.current && mode === "review") {
        setLastVoiceCommand("Rejected current finding")
        await decideIssue(activeIssueRef.current, "rejected")
      } else if (mode !== "review") {
        setCopilotMessage("Switch to Review Mode before rejecting findings.")
      } else {
        setCopilotMessage("No active finding selected to reject.")
      }

      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "generate blocks",
          "copy paste blocks",
          "complete report",
        ],
        [
          "create blocks",
          "make blocks",
          "generate copy paste",
          "finish report blocks",
          "complete inspection blocks",
        ]
      )
    ) {
      await completeInspection()
      setLastVoiceCommand("Completion mode started")
      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "take photo",
          "attach photo",
          "add photo",
        ],
        [
          "take a photo",
          "add a photo",
          "attach a photo",
          "open camera",
          "capture photo",
          "photo this",
        ]
      )
    ) {
      triggerPhotoUpload()
      setLastVoiceCommand("Photo capture opened")
      return true
    }

    if (
      voiceCommandMatches(
        text,
        [
          "clear observation",
          "clear note",
          "clear",
        ],
        [
          "clear this",
          "clear that",
          "erase observation",
          "reset observation",
        ]
      )
    ) {
      setObservation("")
      setLastVoiceCommand("Observation cleared")
      setCopilotMessage("Observation cleared. Continue inspection.")
      return true
    }

    return false
  }


  /*****************************************************************/
  /* 10. OBSERVATION PROCESSING */
  /*****************************************************************/

  // Sends a typed or spoken observation to the backend co-pilot workflow.
  const submitObservation = async (voiceText = null) => {
    const textToSubmit = voiceText || observation

    if (!sessionIdRef.current || !textToSubmit.trim()) return

    setLoading(true)

    try {
      await fetch(`${API_BASE}/workflow/context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          system:
            componentRef.current.includes("Electrical") ||
            componentRef.current.includes("GFCI")
              ? "Electrical"
              : "",
          component: componentRef.current,
          location_note: areaRef.current,
        }),
      })

      const res = await fetch(`${API_BASE}/workflow/observe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          observation: `${textToSubmit}. Location: ${areaRef.current}. Component: ${componentRef.current}.`,
        }),
      })

      const data = await res.json()
      markWorkflowSaved()

      if (data.issue) {
        setIssues((prev) => [data.issue, ...prev])
        setAllIssues((prev) => [data.issue, ...prev])
        setActiveIssue(data.issue)

        const interaction = data.interaction

        setCopilotMessage(
          interaction?.co_pilot_message ||
            `${data.issue.priority_level} issue detected. ${data.issue.professional_finding}`
        )
      }

      setObservation("")
      setLastVoiceCommand("")
    } finally {
      setLoading(false)
    }
  }


  /*****************************************************************/
  /* 11. FOLLOW-UP QUESTIONS */
  /*****************************************************************/

  // Sends a typed or spoken follow-up answer for the active finding.
  const submitFollowUpAnswer = async (issue, voiceAnswer = null) => {
    const answerToSubmit = voiceAnswer || followUpAnswer

    if (!sessionIdRef.current || !issue || !answerToSubmit.trim()) return

    const res = await fetch(`${API_BASE}/workflow/follow-up`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        issue_id: issue.id,
        answer: answerToSubmit,
      }),
    })

    const data = await res.json()
    markWorkflowSaved()

    if (data.issue) {
      setIssues((prev) =>
        prev.map((item) => (item.id === data.issue.id ? data.issue : item))
      )
      setAllIssues((prev) =>
        prev.map((item) => (item.id === data.issue.id ? data.issue : item))
      )

      setActiveIssue(data.issue)

      setCopilotMessage(
        `Follow-up recorded. Updated priority: ${data.issue.priority_level} (${data.issue.priority_score}).`
      )
    }

    setFollowUpAnswer("")
  }


  // Starts voice capture specifically for the current follow-up question.
  const startFollowUpVoice = () => {
    if (!recognitionRef.current || !activeIssueRef.current) return

    voiceModeRef.current = "follow_up"
    setFollowUpAnswer("")
    recognitionRef.current.start()
    setIsListening(true)
  }


  /*****************************************************************/
  /* 12. VOICE INPUT CONTROLS */
  /*****************************************************************/

  // Starts/stops voice capture for observations and commands.
  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      voiceModeRef.current = "observation"
      setObservation("")
      recognitionRef.current.start()
      setIsListening(true)
    }
  }


  /*****************************************************************/
  /* 13. PHOTO MANAGEMENT */
  /*****************************************************************/

  // Opens the hidden file/camera picker for the active issue.
  const triggerPhotoUpload = () => {
    if (!activeIssueRef.current) {
      setCopilotMessage("Select or create a finding before attaching a photo.")
      return
    }

    photoInputRef.current?.click()
  }


  // Uploads selected/captured photo and attaches it to the active finding.
  const handlePhotoSelected = async (event) => {
    const file = event.target.files?.[0]

    if (!file || !sessionIdRef.current || !activeIssueRef.current) return

    setPhotoUploading(true)

    try {
      const formData = new FormData()
      formData.append("session_id", sessionIdRef.current)
      formData.append("issue_id", activeIssueRef.current.id)
      formData.append("photo", file)

      const res = await fetch(`${API_BASE}/workflow/photo`, {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      markWorkflowSaved()

      if (data.issue) {
        setIssues((prev) =>
          prev.map((item) => (item.id === data.issue.id ? data.issue : item))
        )
        setAllIssues((prev) =>
          prev.map((item) => (item.id === data.issue.id ? data.issue : item))
        )

        setActiveIssue(data.issue)

        setCopilotMessage(
          `Photo attached. ${data.photo_count} photo(s) now linked to this finding.`
        )
      }
    } finally {
      setPhotoUploading(false)
      event.target.value = ""
    }
  }


  /*****************************************************************/
  /* 14. REVIEW WORKFLOW AND PRIORITY OVERRIDE */
  /*****************************************************************/

  // Switches from field collection to review queue and selects the highest-priority issue.
  const enterReviewMode = async () => {
    setMode("review")
    setObservation("")
    setShowOverridePanel(false)

    if (sortedIssues.length > 0) {
      setActiveIssue(sortedIssues[0])
      setCopilotMessage(
        `Review mode active. Start with ${sortedIssues[0].priority_level} finding: ${sortedIssues[0].component}.`
      )
    } else {
      setActiveIssue(null)
      setCopilotMessage("Review mode active. No pending findings to review.")
    }
  }


 // Applies an inspector severity override.
// If settings.learn_from_overrides is enabled, backend may use this as learning feedback.
// If disabled, the priority is still changed, but learning feedback is not requested.
const applyPriorityOverride = async (score = overrideScore) => {
  const issue = activeIssueRef.current

  if (!sessionIdRef.current || !issue) {
    setCopilotMessage("No active finding selected for override.")
    return
  }

  if (mode !== "review") {
    setCopilotMessage("Switch to Review Mode before overriding priority.")
    return
  }

  const res = await fetch(`${API_BASE}/workflow/decisions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionIdRef.current,
      decisions: [
        {
          id: issue.id,
          status: "override",
          adjusted_score: Number(score),
          learn_from_override: settings.learn_from_overrides,
        },
      ],
    }),
  })

  const data = await res.json()
  markWorkflowSaved()
  const updatedIssue = data.overridden?.[0]

  if (updatedIssue) {
    setIssues((prev) =>
      prev.map((item) => (item.id === updatedIssue.id ? updatedIssue : item))
    )
    setAllIssues((prev) =>
      prev.map((item) => (item.id === updatedIssue.id ? updatedIssue : item))
    )

    setActiveIssue(updatedIssue)
    setOverrideScore(updatedIssue.priority_score)
    setShowOverridePanel(false)

    setCopilotMessage(
      `Priority overridden to ${updatedIssue.priority_level} (${updatedIssue.priority_score})\nFinding remains pending for approval`
    )
  }
}

// Checks whether a finding is missing required photo documentation.
// Supports both Critical and High findings.
// This is workflow guidance only; it does not generate report content.
const isPhotoRequiredBeforeApproval = (issue) => {
  if (!issue) return false

  const photoCount = issue.photos?.length || 0

  if (photoCount > 0) {
    return false
  }

  const level = issue.priority_level

  if (
    settings.require_photo_for_critical &&
    level === "CRITICAL"
  ) {
    return true
  }

  if (
    settings.require_photo_for_high &&
    level === "HIGH"
  ) {
    return true
  }

  return false
}


  // Approves or rejects a finding and advances to the next highest-priority item.
  const decideIssue = async (issue, status) => {
    if (!sessionIdRef.current || !issue) return

    if (
      status === "approved" &&
      isPhotoRequiredBeforeApproval(issue)
    ) {
      setCopilotMessage(
        "Photo required before approval. Attach a photo to this finding before approving."
      )
      return
    }

    const response = await fetch(`${API_BASE}/workflow/decisions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        decisions: [
          {
            id: issue.id,
            status,
          },
        ],
      }),
    })
    if (response.ok) {
      markWorkflowSaved()
    }

    const remaining = issues.filter((item) => item.id !== issue.id)
    const nextIssue = [...remaining].sort(
      (a, b) => (b.priority_score || 0) - (a.priority_score || 0)
    )[0]

    setIssues(remaining)
    setAllIssues((prev) =>
      prev.map((item) =>
        item.id === issue.id ? { ...item, status } : item
      )
    )

    if (nextIssue) {
      setActiveIssue(nextIssue)
      setShowOverridePanel(false)
      setCopilotMessage(
        status === "approved"
          ? `Finding approved. Next finding: ${nextIssue.priority_level} - ${nextIssue.component}.`
          : `Finding rejected. Next finding: ${nextIssue.priority_level} - ${nextIssue.component}.`
      )
    } else {
      setActiveIssue(null)
      setShowOverridePanel(false)
      setCopilotMessage(
        status === "approved"
          ? "Finding approved. No more pending findings."
          : "Finding rejected. No more pending findings."
      )
    }
  }


  /*****************************************************************/
  /* 15. COMPLETION WORKFLOW */
  /*****************************************************************/

  // Runs coverage review and loads report-ready copy/paste blocks.
  const completeInspection = async () => {
    if (!sessionIdRef.current) return

    if (issues.length > 0) {
      setMode("review")
      setCopilotMessage("Review all pending findings before generating copy/paste blocks.")
      return
    }

    setMode("complete")

    const coverageRes = await fetch(
      `${API_BASE}/workflow/coverage/${sessionIdRef.current}`
    )
    const coverageData = await coverageRes.json()
    markWorkflowSaved()
    setCoverage(coverageData)
    setCoverageReviewed(coverageData.missing_areas?.length === 0)

    const reportRes = await fetch(
      `${API_BASE}/workflow/report/${sessionIdRef.current}`
    )
    const reportData = await reportRes.json()
    setReportBlocks(reportData.report_blocks || [])

    setCopilotMessage(
      "Copy/paste blocks are ready. Review coverage and copy approved finding text when ready."
    )
  }


  // Alias used by voice commands to move into review mode.
  const finishInspection = async () => {
    await enterReviewMode()
  }

  /*****************************************************************/
  /* 16. SESSION SAVE / LOAD */
  /*****************************************************************/

  // This section handles manual save, loading saved sessions,
  // saved session list display, and timed auto-save.
  // Future login/cloud sync will also connect here.


  /*****************************************************************/
  /* SAVE CURRENT INSPECTION */
  /*****************************************************************/

  const saveSession = async (isAutoSave = false) => {
    if (!sessionIdRef.current) return

    try {
      setSaveStatus(isAutoSave ? "Auto Saving..." : "Saving...")

      const response = await fetch(
        `${API_BASE}/workflow/session/${sessionIdRef.current}/save`,
        {
          method: "POST",
        }
      )

      if (response.status === 404) {
        setSaveStatus("Session expired")

        setCopilotMessage(
          "Backend restarted and this session is no longer active. Use Resume or Load to restore the latest saved inspection."
        )

        setShowRecoveryPrompt(true)
        await loadSavedSessions(true)
        return
      }

      const data = await response.json()

      if (data.saved) {
        setSaveStatus(isAutoSave ? "Auto Saved" : "Saved")
        setLastSavedAt(data.saved_at)
        await loadSavedSessions()
      }
    } catch {
      setSaveStatus("Save Failed")
    }
  }


  /*****************************************************************/
  /* LOAD AVAILABLE SAVED SESSIONS */
  /*****************************************************************/

  const loadSavedSessions = async (checkRecovery = false) => {
    try {
      const response = await fetch(
        `${API_BASE}/workflow/sessions`
      )

      const data = await response.json()
      const sessions = data.sessions || []

      setSavedSessions(sessions)

      if (
        checkRecovery &&
        settings.restore_previous_session &&
        sessions.length > 0
      ) {
        setLatestSavedSession(sessions[0])
        setShowRecoveryPrompt(true)
      }
    } catch {
      setSavedSessions([])
    }
  }


  /*****************************************************************/
  /* LOAD SPECIFIC SAVED SESSION */
  /*****************************************************************/

  const loadSession = async (
    sessionToLoad,
    successMessage = "Inspection session loaded successfully."
  ) => {
    try {
      const response = await fetch(
        `${API_BASE}/workflow/session/${sessionToLoad}/load`
      )

      const data = await response.json()

      if (!data.loaded) {
        return
      }

      const loaded = data.session

      setSessionId(
        loaded.session_id
      )
      setInspectionTitle(
        loaded.inspection_title || "Untitled Inspection"
      )

      setIssues(
        loaded.pending_review || []
      )
      setAllIssues(
        loaded.issues || loaded.pending_review || []
      )

      setActiveIssue(
        (loaded.pending_review || [])[0] || null
      )

      setCoverage(null)
      setReportBlocks([])
      setSelectedPhoto(null)
      setReviewedPhotoIds([])
      setMode("inspection")
      setShowLoadPanel(false)
      setShowRecoveryPrompt(false)
      setCoverageReviewed(false)

      if (loaded.context?.location_note) {
        setArea(loaded.context.location_note)
      }

      if (loaded.context?.component) {
        setComponent(loaded.context.component)
      }

      setCopilotMessage(
        successMessage
      )

    } catch {
      setCopilotMessage(
        "Unable to load inspection session."
      )
    }
  }


  /*****************************************************************/
  /* RESTORE CLOUD SESSION INTO LOCAL LOAD FLOW */
  /*****************************************************************/

  const restoreSessionFromSupabase = async () => {
    const inspectionId = cloudRestoreInspectionId.trim()

    if (!inspectionId) {
      setCloudRestoreStatus("Restore failed")
      return
    }

    try {
      setCloudRestoreLoading(true)
      setCloudRestoreStatus("")

      const response = await fetch(
        `${API_BASE}/supabase/inspection/${encodeURIComponent(inspectionId)}/restore`,
        {
          method: "POST",
        }
      )

      const data = await response.json()

      if (!response.ok || !data.restored) {
        setCloudRestoreStatus("Restore failed")
        return
      }

      await loadSavedSessions()
      await loadSession(inspectionId, "Restored from Supabase")
      setCloudRestoreStatus("Restored from Supabase")
      setCloudRestoreInspectionId("")
    } catch {
      setCloudRestoreStatus("Restore failed")
    } finally {
      setCloudRestoreLoading(false)
    }
  }


  /*****************************************************************/
  /* RECOVER LATEST SAVED SESSION */
  /*****************************************************************/

  const recoverLatestSession = async () => {
    if (!latestSavedSession?.session_id) return

    await loadSession(latestSavedSession.session_id)

    setShowRecoveryPrompt(false)
  }


  /*****************************************************************/
  /* DISMISS RECOVERY PROMPT */
  /*****************************************************************/

  const dismissRecoveryPrompt = () => {
    setShowRecoveryPrompt(false)
    setLatestSavedSession(null)
  }

  /*****************************************************************/
  /* 17. COPY / EXPORT UTILITIES */
  /*****************************************************************/

  // Copies an approved finding block to clipboard.
  const copyBlock = async (block) => {
    await navigator.clipboard.writeText(block)
    setCopilotMessage("Copy/paste block copied to clipboard.")
  }


  // Converts backend relative photo URL to full browser URL.
  const getPhotoUrl = (photo) => {
    if (!photo?.url) return ""
    return photo.url.startsWith("http") ? photo.url : `${API_BASE}${photo.url}`
  }


  // Downloads a photo for upload into external report software.
  const downloadPhoto = (photo) => {
    const url = getPhotoUrl(photo)

    const link = document.createElement("a")
    link.href = url
    link.download = photo.filename || "inspection-photo.jpg"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }


  // Attempts to copy the image itself to the clipboard.
  // Browser/report software support varies, so Download is still the fallback.
  const copyPhotoToClipboard = async (photo) => {
    try {
      const url = getPhotoUrl(photo)
      const res = await fetch(url)
      const blob = await res.blob()

      if (!navigator.clipboard || !window.ClipboardItem) {
        setCopilotMessage(
          "Image clipboard copy is not supported in this browser. Use Download Photo instead."
        )
        return
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ])

      setCopilotMessage("Photo copied to clipboard.")
    } catch {
      setCopilotMessage("Could not copy photo. Use Download Photo instead.")
    }
  }


  // Controls the color styling of the main co-pilot response panel.
  const activeLevel = activeIssue?.priority_level || "LOW"
  const primaryButtonClass =
    "min-h-11 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
  const secondaryButtonClass =
    "min-h-11 rounded-2xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
  const compactPrimaryButtonClass =
    "rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
  const compactSecondaryButtonClass =
    "rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
  const dangerButtonClass =
    "min-h-11 rounded-2xl bg-red-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-800"


  /*****************************************************************/
  /* 18. AUTHENTICATION */
  /*****************************************************************/

  // Sends local username/password to the backend login endpoint.
  // This is Phase 1 local auth; future token/cloud auth will replace this.
  const login = async () => {
    setLoginError("")

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      })

      if (!response.ok) {
        setLoginError("Invalid username or password.")
        return
      }

      const data = await response.json()

      if (data.authenticated) {
        setIsAuthenticated(true)
        setCurrentUser(data.username)
        setLoginPassword("")
        setCopilotMessage(`Logged in as ${data.username}.`)
        await loadSettings()

        if (localStorage.getItem(TUTORIAL_STORAGE_KEY) !== "true") {
          setTutorialStep(0)
        }
      }
    } catch {
      setLoginError("Could not connect to login service.")
    }
  }

  // Logs out of local mode and hides session-specific panels.
  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
    })

    setIsAuthenticated(false)
    setCurrentUser(null)
    setLoginUsername("")
    setLoginPassword("")
    setShowLoadPanel(false)
    setShowProfileMenu(false)
    setShowProfilePanel(false)
    setTutorialStep(null)
    setShowRecoveryPrompt(false)
    setMode("inspection")
    setCopilotMessage("Logged out.")
  }


/*****************************************************************/
/* 19. SETTINGS */
/*****************************************************************/

// settings.voice_sensitivity
// Controls how strictly spoken phrases must match voice commands.
// strict = exact commands, normal = current behavior, flexible = conversational commands.

// settings.show_ai_reasoning
// Controls visibility of AI-generated explanations,
// rationale, and reasoning panels.
// Does NOT affect scoring or workflow behavior.

// settings.show_confidence_score
// Controls visibility of AI-generated confidence / priority scores.
// Does NOT affect prioritization, sorting, or workflow behavior.
const loadSettings = async () => {
  try {
    setSettingsLoading(true)
    setSettingsStatus("Loading settings...")

    const response = await fetch(`${API_BASE}/settings`)
    const data = await response.json()

    if (data.settings) {
      setSettings(data.settings)

      setAutoSubmitVoice(data.settings.voice_auto_submit)
      setAutoSaveEnabled(data.settings.auto_save_enabled)

      if (data.settings.default_mode) {
        setMode(data.settings.default_mode)
      }

      setSettingsStatus(
        data.storage_mode === "supabase"
          ? "Settings loaded from Supabase"
          : "Settings using local fallback"
      )
    }
  } catch {
    setSettingsStatus("Could not load settings")
  } finally {
    setSettingsLoading(false)
  }
}

const saveSettings = async () => {
  try {
    setSettingsLoading(true)
    setSettingsStatus("Saving settings...")

    const response = await fetch(`${API_BASE}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    })

    const data = await response.json()

    if (data.saved) {
      setSettings(data.settings)

      setAutoSubmitVoice(data.settings.voice_auto_submit)
      setAutoSaveEnabled(data.settings.auto_save_enabled)

      setSettingsStatus(
        data.storage_mode === "supabase"
          ? "Settings saved to Supabase"
          : "Settings using local fallback"
      )
      setShowSettingsPanel(false)
    }
  } catch {
    setSettingsStatus("Could not save settings")
  } finally {
    setSettingsLoading(false)
  }
}

const updateSetting = (key, value) => {
  setSettings((current) => ({
    ...current,
    [key]: value,
  }))
}

const settingsHelp = {
  appearance_theme:
    "System follows your device appearance automatically. Light and Dark keep the selected theme until you change it.",
  default_mode:
    "Choose which workspace opens after sign-in. Inspection is best for normal field work.",
  voice_auto_submit:
    "When enabled, a spoken observation is sent for analysis as soon as speech capture ends.",
  voice_language:
    "Sets the language model used by your browser when converting speech to text.",
  voice_sensitivity:
    "Strict matches exact commands. Normal accepts common command phrases. Flexible also accepts more conversational wording.",
  require_photo_for_critical:
    "Blocks approval of Critical findings until at least one photo is attached.",
  require_photo_for_high:
    "Blocks approval of High findings until at least one photo is attached.",
  auto_save_enabled:
    "Periodically saves the active inspection session to local storage.",
  auto_save_interval_seconds:
    "Controls how frequently the active inspection is saved while auto-save is enabled.",
  restore_previous_session:
    "Shows a prompt after sign-in when a saved inspection is available to resume.",
  show_ai_reasoning:
    "Shows the co-pilot's short explanation for why a finding received its priority.",
  show_confidence_score:
    "Shows the numeric priority score used to sort findings. Hiding it does not change prioritization.",
  learn_from_overrides:
    "Allows priority changes you make during review to influence later co-pilot scoring patterns.",
}

const renderSettingsHelp = (setting) => (
  <span className="relative inline-flex">
    <button
      type="button"
      aria-label={`Explain ${setting}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setActiveSettingsHelp((current) =>
          current === setting ? null : setting
        )
      }}
      className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700 hover:bg-blue-200"
    >
      ?
    </button>

    {activeSettingsHelp === setting && (
      <span className="absolute right-0 top-7 z-20 w-64 rounded-xl border border-blue-200 bg-white p-3 text-xs font-medium leading-relaxed text-slate-700 shadow-lg">
        {settingsHelp[setting]}
      </span>
    )}
  </span>
)

const renderPhotoGalleryPanel = () => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Photo Gallery
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          Verify photo documentation before completion.
        </p>
      </div>

      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
        {galleryPhotos.length}
      </span>
    </div>

    {galleryPhotos.length === 0 ? (
      <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
        No attached photos yet.
      </p>
    ) : (
      <div className="mt-4 grid grid-cols-2 gap-3">
        {galleryPhotos.map((galleryPhoto) => (
          <button
            key={galleryPhoto.photo.photo_id}
            onClick={() => {
              setSelectedPhoto(galleryPhoto)
              setReviewedPhotoIds((current) =>
                current.includes(galleryPhoto.photo.photo_id)
                  ? current
                  : [...current, galleryPhoto.photo.photo_id]
              )
            }}
            className="min-h-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left text-slate-900 transition hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-400 dark:hover:bg-blue-950/50"
          >
            <img
              src={getPhotoUrl(galleryPhoto.photo)}
              alt={galleryPhoto.photo.filename}
              className="h-28 w-full object-cover"
            />

            <div className="p-3">
              <p className="truncate text-sm font-bold">
                {galleryPhoto.component}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">
                {galleryPhoto.priorityLevel}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                {reviewedPhotoIds.includes(galleryPhoto.photo.photo_id)
                  ? "Verified"
                  : "Open to verify"}
              </p>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
)


  /*****************************************************************/
  /* 20. UI RENDER */
  /*****************************************************************/

  const inspectionWorkspaceHiddenOnMobile = Boolean(activeMobilePanel)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Hidden file/camera input used by the Take Photo button. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelected}
      />

    {!isAuthenticated && (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-3xl font-bold text-slate-900">
            Inspection Co-Pilot
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Sign in to access your inspections, photos, and saved sessions.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              login()
            }}
            className="mt-6 space-y-4"
          >
            <label htmlFor="login-username" className="block">
              <span className="text-sm font-semibold text-slate-600">
                Username
              </span>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3 outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800"
                placeholder="username"
              />
            </label>

            <label htmlFor="login-password" className="block">
              <span className="text-sm font-semibold text-slate-600">
                Password
              </span>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3 outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800"
                placeholder="password"
              />
            </label>

            {loginError && (
              <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-blue-700 py-4 text-lg font-bold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )}
    
    {isAuthenticated && (
      <div className="mx-auto max-w-7xl p-3 pb-24 sm:p-4 sm:pb-4 md:p-6">
        {/* Header: mode navigation and session status. */}
        <header className="relative mb-4 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 pr-28 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:mb-6 sm:p-5 sm:pr-20 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Inspection Co-Pilot
            </h1>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">
              Inspection Mode → Review Mode → Copy/Paste Blocks
            </p>
            <label className="mt-3 block max-w-xl">
              <span className="sr-only">Inspection title</span>
              <input
                value={inspectionTitleDraft}
                onChange={(event) => setInspectionTitleDraft(event.target.value)}
                onBlur={updateInspectionTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur()
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                aria-label="Inspection title"
              />
              {titleSaving && (
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  Saving title...
                </span>
              )}
            </label>

          </div>

          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            <button
              onClick={() => setMode("inspection")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                mode === "inspection"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              Inspect
            </button>

            <button
              onClick={enterReviewMode}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                mode === "review"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              Review
            </button>

            <button
              onClick={completeInspection}
              disabled={mode !== "complete" && !reviewComplete}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                mode === "complete"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Complete
            </button>

            <button
              onClick={() => setShowNewInspectionPanel(true)}
              className="rounded-full bg-blue-700 px-4 py-2 text-sm font-bold text-white dark:bg-blue-600"
            >
              New Inspection
            </button>
          </div>

          <div className="absolute right-16 top-4 sm:hidden">
            <button
              onClick={() => showMobilePanel("menu")}
              aria-label="Open menu"
              className="flex h-10 min-w-16 items-center justify-center rounded-full bg-blue-700 px-3 text-xs font-black uppercase text-white shadow-sm hover:bg-blue-800"
            >
              Menu
            </button>
          </div>

          <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
            <button
              onClick={() => setShowProfileMenu((value) => !value)}
              aria-label="Open profile menu"
              className="hidden h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-black uppercase text-white shadow-sm hover:bg-slate-700 sm:flex"
            >
              {inspectorDisplayName.charAt(0)}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-100 px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Signed in as
                  </p>
                  <p className="mt-1 truncate font-bold text-slate-900">
                    {inspectorDisplayName}
                  </p>
                </div>

                <button
                  onClick={() => {
                    saveSession(false)
                    setShowProfileMenu(false)
                  }}
                  className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-100"
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    showMobilePanel("load")
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-100"
                >
                  Load
                </button>

                <button
                  onClick={() => {
                    showMobilePanel("settings")
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-100"
                >
                  Settings
                </button>

                <button
                  onClick={logout}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {activeMobilePanel === "menu" && (
          <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Menu
                </p>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Inspection tools
                </h2>
              </div>

              <button
                onClick={closeMobilePanels}
                className={compactSecondaryButtonClass}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  closeMobilePanels()
                  setShowNewInspectionPanel(true)
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
                className={primaryButtonClass}
              >
                New Inspection
              </button>

              <button
                onClick={() => {
                  saveSession(false)
                  closeMobilePanels()
                }}
                disabled={!sessionId}
                className={primaryButtonClass}
              >
                Save
              </button>

              <button
                onClick={() => showMobilePanel("settings")}
                className={secondaryButtonClass}
              >
                Settings
              </button>

              <button
                onClick={() => showMobilePanel("load")}
                className={secondaryButtonClass}
              >
                Load / Restore
              </button>

              <button
                onClick={() => showMobilePanel("gallery")}
                className={secondaryButtonClass}
              >
                Photo Gallery
              </button>

              <button
                onClick={logout}
                className={dangerButtonClass}
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {activeMobilePanel === "gallery" && (
          <div className="mb-4 sm:hidden">
            <div className="mb-3 flex justify-end">
              <button
                onClick={closeMobilePanels}
                className={compactSecondaryButtonClass}
              >
                Back to Inspect
              </button>
            </div>
            {renderPhotoGalleryPanel()}
          </div>
        )}

        {false && activeMobilePanel === "help" && (
          <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Help / Voice Commands
              </h2>
              <button
                onClick={closeMobilePanels}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white dark:bg-slate-200 dark:text-slate-950"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <p className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                Try: “move to garage”, “inspecting electrical panel”, “take photo”, “start review”, or “finish inspection”.
              </p>
              <button
                onClick={startTutorial}
                className="min-h-11 w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white"
              >
                Replay Walkthrough
              </button>
            </div>
          </div>
        )}

        {showNewInspectionPanel && (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Start New Inspection
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Give this inspection a short working title for save and resume lists.
                </p>
              </div>

              <button
                onClick={() => {
                  setNewInspectionTitle("")
                  setShowNewInspectionPanel(false)
                }}
                className={compactSecondaryButtonClass}
              >
                Cancel
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={newInspectionTitle}
                onChange={(event) => setNewInspectionTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    startNewInspection()
                  }
                }}
                className="flex-1 rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Example: 124 Oak Street"
              />

              <button
                onClick={startNewInspection}
                disabled={!newInspectionTitle.trim()}
                className={primaryButtonClass}
              >
                Start Inspection
              </button>
            </div>
          </div>
        )}

        {showProfilePanel && (
          <div className={`mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:mb-6 sm:p-5 ${
            activeMobilePanel === "profile" ? "" : "hidden sm:block"
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-xl font-black uppercase text-white">
                  {inspectorDisplayName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {inspectorDisplayName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Local inspection profile
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowProfilePanel(false)
                  setActiveMobilePanel(null)
                }}
                className={compactSecondaryButtonClass}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Save / Load status banner. */}
          <div className={`mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:mb-6 ${
            activeMobilePanel === "load" ? "" : "hidden sm:block"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p>
                  Save status: <strong>{saveStatus}</strong>
                  {lastSavedAt && (
                    <span>
                      {" "}
                      — Last saved: {new Date(lastSavedAt).toLocaleTimeString()}
                    </span>
                  )}
                </p>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isOnline
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {isOnline ? "Online" : "Offline - changes cannot save"}
                </span>
              </div>

              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={autoSaveEnabled}
                  onChange={(event) => setAutoSaveEnabled(event.target.checked)}
                />
                Auto-save every {settings.auto_save_interval_seconds} seconds
              </label>
            </div>

            {showLoadPanel && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 font-bold text-slate-800">
                  Saved Sessions
                </p>

                {savedSessions.length === 0 && (
                  <p className="text-slate-500">
                    No saved sessions yet.
                  </p>
                )}

                {savedSessions.length > 0 && (
                  <input
                    value={savedSessionSearch}
                    onChange={(event) => setSavedSessionSearch(event.target.value)}
                    className="mb-3 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Search inspections by title or address"
                  />
                )}

                <div className="space-y-2">
                  {filteredSavedSessions.map((session) => (
                    <button
                      key={session.session_id}
                      onClick={() => loadSession(session.session_id)}
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      <p className="font-bold text-slate-800">
                        {session.inspection_title || "Untitled Inspection"}
                      </p>

                      <p className="text-xs text-slate-500">
                        Saved:{" "}
                        {session.saved_at
                          ? new Date(session.saved_at).toLocaleString()
                          : "Unknown"}
                      </p>

                      <p className="text-xs text-slate-500">
                        Issues: {session.issue_count} | Confirmed:{" "}
                        {session.confirmed_count}
                      </p>
                    </button>
                  ))}
                </div>

                {savedSessions.length > 0 && filteredSavedSessions.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No saved inspections match that search.
                  </p>
                )}

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="font-bold text-slate-800">
                    Restore from Supabase
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Enter a cloud inspection ID to restore it into the local saved sessions list.
                  </p>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={cloudRestoreInspectionId}
                      onChange={(event) => {
                        setCloudRestoreInspectionId(event.target.value)
                        setCloudRestoreStatus("")
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="Inspection ID"
                    />

                    <button
                      onClick={restoreSessionFromSupabase}
                      disabled={cloudRestoreLoading}
                      className="min-h-11 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-700 disabled:opacity-80 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
                    >
                      {cloudRestoreLoading
                        ? "Restoring..."
                        : "Restore from Supabase"}
                    </button>
                  </div>

                  {cloudRestoreStatus && (
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        cloudRestoreStatus === "Restored from Supabase"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {cloudRestoreStatus}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

        {/* Settings drawer. */}
        {showSettingsPanel && (
          <div className={`mb-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900 sm:mb-6 sm:p-5 ${
            activeMobilePanel === "settings" ? "" : "hidden sm:block"
          }`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Settings
                </h2>
                <p className="text-sm text-slate-500">
                  Adjust local inspection preferences.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSettingsPanel(false)
                  setActiveMobilePanel(null)
                }}
                className={compactSecondaryButtonClass}
              >
                Close
              </button>
            </div>

            {settingsStatus && (
              <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                {settingsStatus}
              </div>
            )}

            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Profile
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-black uppercase text-white dark:bg-slate-200 dark:text-slate-950">
                    {inspectorDisplayName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      {inspectorDisplayName}
                    </p>
                    <p className="text-sm text-slate-500">
                      Local inspection profile
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Help / Voice Commands
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Try: "move to garage", "inspecting electrical panel", "take photo", "start review", or "finish inspection".
                </p>
                <button
                  onClick={startTutorial}
                  className={`mt-4 w-full ${primaryButtonClass}`}
                >
                  Replay Walkthrough
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">General</h3>

                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-slate-600">
                    Inspector Name
                  </span>
                  <input
                    value={settings.inspector_name}
                    onChange={(event) =>
                      updateSetting("inspector_name", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Inspector name"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Default Mode</span>
                    {renderSettingsHelp("default_mode")}
                  </span>
                  <select
                    value={settings.default_mode}
                    onChange={(event) =>
                      updateSetting("default_mode", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="inspection">Inspection</option>
                    <option value="review">Review</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>

                <label className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Appearance</span>
                    {renderSettingsHelp("appearance_theme")}
                  </span>
                  <select
                    value={settings.appearance_theme || "system"}
                    onChange={(event) =>
                      updateSetting("appearance_theme", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Voice</h3>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.voice_auto_submit}
                      onChange={(event) =>
                        updateSetting("voice_auto_submit", event.target.checked)
                      }
                    />
                    Auto-submit voice observations
                  </label>
                  {renderSettingsHelp("voice_auto_submit")}
                </div>

                <label className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Voice Language</span>
                    {renderSettingsHelp("voice_language")}
                  </span>
                  <select
                    value={settings.voice_language}
                    onChange={(event) =>
                      updateSetting("voice_language", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="en-US">English US</option>
                    <option value="en-GB">English UK</option>
                  </select>
                </label>

                <label className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Voice Sensitivity</span>
                    {renderSettingsHelp("voice_sensitivity")}
                  </span>
                  <select
                    value={settings.voice_sensitivity}
                    onChange={(event) =>
                      updateSetting("voice_sensitivity", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="strict">Strict</option>
                    <option value="normal">Normal</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Inspection</h3>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.require_photo_for_critical}
                      onChange={(event) =>
                        updateSetting("require_photo_for_critical", event.target.checked)
                      }
                    />
                    Require photo for Critical findings
                  </label>
                  {renderSettingsHelp("require_photo_for_critical")}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.require_photo_for_high}
                      onChange={(event) =>
                        updateSetting("require_photo_for_high", event.target.checked)
                      }
                    />
                    Require photo for High findings
                  </label>
                  {renderSettingsHelp("require_photo_for_high")}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">Save / Load</h3>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.auto_save_enabled}
                      onChange={(event) =>
                        updateSetting("auto_save_enabled", event.target.checked)
                      }
                    />
                    Auto-save enabled
                  </label>
                  {renderSettingsHelp("auto_save_enabled")}
                </div>

                <label className="mt-4 block">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-600">
                    <span>Auto-save Interval</span>
                    {renderSettingsHelp("auto_save_interval_seconds")}
                  </span>
                  <select
                    value={settings.auto_save_interval_seconds}
                    onChange={(event) =>
                      updateSetting(
                        "auto_save_interval_seconds",
                        Number(event.target.value)
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </label>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.restore_previous_session}
                      onChange={(event) =>
                        updateSetting("restore_previous_session", event.target.checked)
                      }
                    />
                    Show recovery prompt on startup
                  </label>
                  {renderSettingsHelp("restore_previous_session")}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 lg:col-span-2">
                <h3 className="font-bold text-slate-900">AI</h3>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.show_ai_reasoning}
                        onChange={(event) =>
                          updateSetting("show_ai_reasoning", event.target.checked)
                        }
                      />
                      Show AI reasoning
                    </label>
                    {renderSettingsHelp("show_ai_reasoning")}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.show_confidence_score}
                        onChange={(event) =>
                          updateSetting("show_confidence_score", event.target.checked)
                        }
                      />
                      Show confidence score
                    </label>
                    {renderSettingsHelp("show_confidence_score")}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.learn_from_overrides}
                        onChange={(event) =>
                          updateSetting("learn_from_overrides", event.target.checked)
                        }
                      />
                      Learn from overrides
                    </label>
                    {renderSettingsHelp("learn_from_overrides")}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                onClick={loadSettings}
                disabled={settingsLoading}
                className={compactSecondaryButtonClass}
              >
                Reload
              </button>

              <button
                onClick={saveSettings}
                disabled={settingsLoading}
                className={compactPrimaryButtonClass}
              >
                {settingsLoading ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        )}

        {/* Startup recovery prompt. */}
          {showRecoveryPrompt && latestSavedSession && (
            <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold">
                    Resume previous inspection?
                  </p>

                  <p className="mt-1 text-sm">
                    Latest saved session:{" "}
                    <strong>
                      {latestSavedSession.inspection_title || "Untitled Inspection"}
                    </strong>
                    {" "}— saved{" "}
                    {latestSavedSession.saved_at
                      ? new Date(latestSavedSession.saved_at).toLocaleString()
                      : "recently"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={recoverLatestSession}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                  >
                    Resume
                  </button>

                  <button
                    onClick={() => {
                      dismissRecoveryPrompt()
                      setShowNewInspectionPanel(true)
                    }}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-blue-800"
                  >
                    Start New
                  </button>
                </div>
              </div>
            </div>
          )}

        <main className={`grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3 ${
          inspectionWorkspaceHiddenOnMobile ? "hidden sm:grid" : ""
        }`}>
          <section className="flex flex-col gap-4 sm:gap-6 lg:col-span-2">
            {/* Inspection Mode: collect observations and attach field context. */}
            {mode === "inspection" && (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Current inspection target
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                      {area} → {component}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-slate-600">
                        Area
                      </span>
                      <select
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        className="rounded-2xl border border-slate-300 bg-white p-3 outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        {AREA_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-slate-600">
                        Component
                      </span>
                      <select
                        value={component}
                        onChange={(e) => setComponent(e.target.value)}
                        className="rounded-2xl border border-slate-300 bg-white p-3 outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        {COMPONENT_OPTIONS.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">
                    Voice commands: “move to garage”, “inspecting electrical
                    panel”, “take photo”, “start review”, “finish inspection”.
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Inspector input
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                        Speak observation or command
                      </h2>
                    </div>

                    <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={autoSubmitVoice}
                        onChange={(e) => setAutoSubmitVoice(e.target.checked)}
                      />
                      Auto-submit voice
                    </label>
                  </div>

                  <textarea
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    placeholder="Example: Burn marks visible around outlet..."
                    className="min-h-[120px] w-full rounded-2xl border border-slate-300 bg-slate-50 p-4 text-base outline-none focus:bg-white focus:ring-2 focus:ring-slate-400 sm:min-h-[150px] sm:text-lg"
                  />

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      onClick={toggleVoiceInput}
                      disabled={!voiceSupported || loading}
                      className={`rounded-2xl py-4 text-lg font-bold transition ${
                        isListening
                          ? "bg-red-600 text-white"
                          : "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {isListening ? "🛑 Stop Listening" : "🎤 Speak"}
                    </button>

                    <button
                      onClick={() => submitObservation()}
                      disabled={loading || !sessionId || !observation.trim()}
                      className="rounded-2xl bg-blue-700 py-4 text-lg font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:bg-blue-600 dark:hover:bg-blue-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
                    >
                      {loading ? "Analyzing..." : "Submit Observation"}
                    </button>
                  </div>

                  {isListening && (
                    <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                      Listening...
                    </p>
                  )}

                  {lastVoiceCommand && (
                    <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
                      Voice command: {lastVoiceCommand}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Co-pilot Response Panel: shows active finding, follow-ups, photo docs, and review controls. */}
            {(mode === "inspection" || mode === "review") && (
              <div
                className={`rounded-3xl border p-4 shadow-sm sm:p-6 ${
                  levelStyles[activeLevel]
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-70">
                      Co-pilot response
                    </p>
                    <h2 className="mt-1 text-xl font-bold sm:text-2xl">
                      {activeIssue
                        ? `${activeIssue.priority_level} Finding`
                        : "Ready"}
                    </h2>
                  </div>

                  {settings.show_confidence_score && activeIssue && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${
                        badgeStyles[activeIssue.priority_level]
                      }`}
                    >
                      {activeIssue.priority_score}
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-base font-semibold leading-relaxed sm:text-lg">
                  {copilotMessageLines.map((line, index) => (
                    <p key={`${line}-${index}`}>
                      {line}
                    </p>
                  ))}
                </div>

                {activeIssue && (
                  <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm leading-relaxed">
                    <p className="font-bold">Professional finding</p>
                    <p className="mt-1">{activeIssue.professional_finding}</p>

                    {settings.show_ai_reasoning && activeIssue.reasoning && (
                      <>
                        <p className="mt-4 font-bold">AI reasoning</p>
                        <p className="mt-1">{activeIssue.reasoning}</p>
                      </>
                    )}

                    {activeIssue.follow_up?.required &&
                      !activeIssue.follow_up?.answered && (
                        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <p className="font-bold text-blue-900">
                            Follow-up question
                          </p>
                          <p className="mt-1 text-blue-800">
                            {activeIssue.follow_up.question}
                          </p>

                          <textarea
                            value={followUpAnswer}
                            onChange={(e) => setFollowUpAnswer(e.target.value)}
                            placeholder="Answer follow-up..."
                            className="mt-3 min-h-[90px] w-full rounded-xl border border-blue-200 bg-white p-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-300"
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={startFollowUpVoice}
                              className="rounded-xl bg-blue-100 px-4 py-2 text-sm font-bold text-blue-800"
                            >
                              🎤 Speak Follow-Up
                            </button>

                            <button
                              onClick={() => submitFollowUpAnswer(activeIssue)}
                              disabled={!followUpAnswer.trim()}
                              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                            >
                              Submit Follow-Up
                            </button>
                          </div>
                        </div>
                      )}

                    {activeIssue.follow_up?.answered && (
                      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                        <p className="font-bold text-green-900">
                          Follow-up recorded
                        </p>
                        <p className="mt-1 text-green-800">
                          {activeIssue.follow_up.answer}
                        </p>
                      </div>
                    )}

                    {showOverridePanel && mode === "review" && (
                      <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
                        <p className="font-bold text-purple-900">
                          Override Priority
                        </p>
                        <p className="mt-1 text-purple-800">
                          Change severity if the AI overestimated or underestimated this finding.
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {PRIORITY_OPTIONS.map((option) => (
                            <button
                              key={option.label}
                              onClick={() => setOverrideScore(option.score)}
                              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                                overrideScore === option.score
                                  ? "bg-purple-700 text-white"
                                  : "bg-white text-purple-800"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <div className="mt-4">
                          <label className="text-sm font-bold text-purple-900">
                            Adjusted Score: {overrideScore} ({scoreToLevel(overrideScore)})
                          </label>

                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={overrideScore}
                            onChange={(e) => setOverrideScore(Number(e.target.value))}
                            className="mt-2 w-full"
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => applyPriorityOverride()}
                            className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-bold text-white"
                          >
                            Apply Override
                          </button>

                          <button
                            onClick={() => setShowOverridePanel(false)}
                            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-purple-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {activeIssue.interaction?.suggest_photo &&
                      !isPhotoRequiredBeforeApproval(activeIssue) && (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 font-semibold">
                          📷 Photo recommended for documentation.
                        </div>
                    )}

                    {isPhotoRequiredBeforeApproval(activeIssue) && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-800">
                        📷 Photo required before approval for this finding.
                      </div>
                    )}

                    {activeIssue.photos?.length > 0 && (
                      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                        <p className="font-bold text-green-900">
                          Photo documentation attached
                        </p>

                        <p className="mt-1 text-green-800">
                          {activeIssue.photos.length} photo(s) linked to this finding.
                        </p>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {activeIssue.photos.map((photo) => (
                            <div
                              key={photo.photo_id}
                              className="rounded-xl border border-green-200 bg-white p-3"
                            >
                              <img
                                src={getPhotoUrl(photo)}
                                alt={photo.filename}
                                className="h-40 w-full rounded-lg object-cover"
                              />

                              <p className="mt-2 truncate text-xs font-semibold text-slate-600">
                                {photo.filename}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() =>
                                    window.open(getPhotoUrl(photo), "_blank")
                                  }
                                  className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800"
                                >
                                  Open
                                </button>

                                <button
                                  onClick={() => downloadPhoto(photo)}
                                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                                >
                                  Download
                                </button>

                                <button
                                  onClick={() => copyPhotoToClipboard(photo)}
                                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                                >
                                  Copy Image
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {reviewComplete && (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                    <p className="font-bold text-slate-900">
                      Review complete
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      No pending findings remain. Create approved copy/paste blocks for outside report software.
                    </p>
                    <button
                      onClick={completeInspection}
                      className={`mt-4 w-full ${primaryButtonClass}`}
                    >
                      Generate Copy/Paste Blocks
                    </button>
                  </div>
                )}

                {activeIssue && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={triggerPhotoUpload}
                      disabled={photoUploading}
                      className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm disabled:opacity-50"
                    >
                      {photoUploading ? "Uploading..." : "📷 Take Photo"}
                    </button>

                    {mode === "review" && (
                      <>
                        <button
                          onClick={() => decideIssue(activeIssue, "approved")}
                          disabled={isPhotoRequiredBeforeApproval(activeIssue)}
                          className={`rounded-xl px-4 py-3 text-sm font-bold shadow-sm ${
                            isPhotoRequiredBeforeApproval(activeIssue)
                              ? "cursor-not-allowed bg-slate-300 text-slate-600"
                              : "bg-green-600 text-white"
                          }`}
                        >
                          {isPhotoRequiredBeforeApproval(activeIssue)
                            ? "📷 Photo Required"
                            : "✅ Approve"}
                        </button>

                        <button
                          onClick={() => setShowOverridePanel((value) => !value)}
                          className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
                        >
                          ⚡ Override
                        </button>

                        <button
                          onClick={() => decideIssue(activeIssue, "rejected")}
                          className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
                        >
                          ❌ Reject
                        </button>
                      </>
                    )}

                    {/* Inspection Mode: collect observations and attach field context. */}
                    {mode === "inspection" && (
                      <button
                        onClick={enterReviewMode}
                        className={compactPrimaryButtonClass}
                      >
                        Start Review
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Completion Mode: final coverage and copy/paste output area. */}
            {mode === "complete" && (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Approved Copy/Paste Blocks
                  </h2>
                  <p className="mt-2 text-slate-600">
                    Coverage review and approved copy/paste blocks are ready.
                  </p>
                </div>

                <div
                  className={`rounded-3xl border p-4 shadow-sm sm:p-6 ${
                    completionReadiness.ready
                      ? "border-green-200 bg-green-50"
                      : "border-yellow-200 bg-yellow-50"
                  }`}
                >
                  <h2 className="text-xl font-bold text-slate-900">
                    Completion Readiness
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Confirm workflow QA before copying approved blocks.
                  </p>

                  <div className="mt-4 space-y-2">
                    {completionReadiness.items.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 rounded-xl bg-white/80 p-3 text-sm font-bold text-slate-800"
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            item.ready
                              ? "bg-green-600 text-white"
                              : "bg-yellow-400 text-yellow-950"
                          }`}
                        >
                          {item.ready ? "OK" : "!"}
                        </span>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Sidebar: counts, pending/review queue, completion controls, coverage, and report blocks. */}
          <aside className="hidden flex-col gap-4 sm:flex sm:gap-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm sm:p-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Critical
                </p>
                <p className="mt-2 text-3xl font-black text-red-600">
                  {counts.critical}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm sm:p-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  High
                </p>
                <p className="mt-2 text-3xl font-black text-orange-500">
                  {counts.high}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm sm:p-4">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Pending
                </p>
                <p className="mt-2 text-3xl font-black text-slate-900">
                  {counts.pending}
                </p>
              </div>
            </div>

            {mode === "complete" && sortedIssues.length === 0 ? (
              <div className="rounded-3xl border border-green-200 bg-green-50 p-4 shadow-sm">
                <p className="font-bold text-green-900">
                  All findings reviewed
                </p>
                <p className="mt-1 text-sm text-green-800">
                  No pending findings remain in the review queue.
                </p>
              </div>
            ) : mode === "review" ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === "review" ? "Review Queue" : "Pending Findings"}
                </h2>
                <span className="text-sm font-semibold text-slate-500">
                  {issues.length} item(s)
                </span>
              </div>

              <div className="space-y-3">
                {sortedIssues.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    No pending findings.
                  </div>
                )}

                {sortedIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => {
                      setActiveIssue(issue)
                      setShowOverridePanel(false)
                      setCopilotMessage(
                        issue.interaction?.co_pilot_message ||
                          `${issue.priority_level} issue selected.`
                      )
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${
                      levelStyles[issue.priority_level]
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-wide">
                        {issue.priority_level}
                      </span>
                      {settings.show_confidence_score && (
                        <span className="text-sm font-black">
                          {issue.priority_score}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 font-bold">{issue.component}</p>
                    <p className="mt-1 line-clamp-2 text-sm opacity-90">
                      {issue.professional_finding}
                    </p>

                    {issue.photos?.length > 0 && (
                      <p className="mt-2 text-xs font-bold">
                        📷 {issue.photos.length} photo(s)
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
            ) : null}

            {mode !== "complete" && (
              <div className="rounded-3xl bg-slate-900 p-4 text-white shadow-sm sm:p-6">
                <h2 className="text-xl font-bold">
                  {mode === "inspection" ? "Finish Inspection" : "Review Findings"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {mode === "inspection"
                    ? "Move to review mode and approve findings when ready."
                    : issues.length === 0
                      ? "Review is complete. Generate approved copy/paste blocks."
                      : "Work through the review queue before creating copy/paste blocks."}
                </p>

                <button
                  onClick={mode === "inspection" ? enterReviewMode : completeInspection}
                  className={`mt-5 w-full rounded-2xl bg-white py-4 font-bold text-slate-900 transition hover:bg-slate-100 ${
                    mode === "review" && issues.length > 0 ? "hidden" : ""
                  }`}
                >
                  {mode === "inspection" ? "Start Review" : "Generate Copy/Paste Blocks"}
                </button>
              </div>
            )}

            {coverage && (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold text-slate-900">
                  Coverage Review
                </h2>

                {coverage.missing_areas?.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {coverage.missing_areas.map((item) => (
                      <div
                        key={item}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-yellow-50 p-3 text-sm font-semibold text-yellow-800"
                      >
                        <span>Possible missed area: {item}</span>
                        <button
                          onClick={() => {
                            setMode("inspection")
                            setCoverageReviewed(true)
                            setCopilotMessage(
                              `Coverage review selected ${item}. Continue inspection and document observations for this system.`
                            )
                          }}
                          className="rounded-lg bg-yellow-100 px-3 py-2 text-xs font-bold text-yellow-900 hover:bg-yellow-200"
                        >
                          Return to Inspection
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => setCoverageReviewed(true)}
                      className={`w-full rounded-xl px-4 py-3 text-sm font-bold ${
                        coverageReviewed
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-900 text-white"
                      }`}
                    >
                      {coverageReviewed
                        ? "Coverage Gaps Reviewed"
                        : "Mark Coverage Gaps Reviewed"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                    No major coverage gaps detected.
                  </p>
                )}
              </div>
            )}

            {renderPhotoGalleryPanel()}

            {mode === "complete" && (
              <div
                className={`rounded-3xl border p-4 shadow-sm sm:p-6 ${
                  completionReadiness.ready && lastSavedAt
                    ? "border-green-200 bg-green-50"
                    : "border-yellow-200 bg-yellow-50"
                }`}
              >
                <h2 className="text-xl font-bold text-slate-900">
                  Desktop Handoff
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {completionReadiness.ready && lastSavedAt
                    ? "Saved and ready to open on the desktop."
                    : "Finish the readiness items and save before moving to the desktop."}
                </p>

                {lastSavedAt && (
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    Last saved: {new Date(lastSavedAt).toLocaleString()}
                  </p>
                )}

                <button
                  onClick={() => saveSession(false)}
                  disabled={!sessionId || !isOnline}
                  className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  Save for Desktop
                </button>
              </div>
            )}

            {reportBlocks.length > 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold text-slate-900">
                  Copy/Paste Blocks
                </h2>

                <div className="mt-4 space-y-4">
                  {reportBlocks.map((block, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <pre className="whitespace-pre-wrap text-sm text-slate-700">
                        {block}
                      </pre>

                      <button
                        onClick={() => copyBlock(block)}
                        className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                      >
                        Copy Block
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </main>

        {/* Mobile field toolbar: keeps primary workflow actions thumb-friendly. */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 sm:hidden">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
            <button
              onClick={() => {
                setMode("inspection")
                closeMobilePanels()
              }}
              className={`rounded-xl px-1 py-3 text-xs font-bold ${
                mode === "inspection"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              Inspect
            </button>

            <button
              onClick={() => {
                closeMobilePanels()
                enterReviewMode()
              }}
              className={`rounded-xl px-1 py-3 text-xs font-bold ${
                mode === "review"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              Review
            </button>

            <button
              onClick={() => showMobilePanel("menu")}
              className={`rounded-xl px-1 py-3 text-xs font-bold ${
                activeMobilePanel === "menu"
                  ? "bg-blue-700 text-white dark:bg-blue-600"
                  : "bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100"
              }`}
            >
              Menu
            </button>
          </div>
        </nav>

        {tutorialStep !== null && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                  Walkthrough {tutorialStep + 1} of {TUTORIAL_STEPS.length}
                </p>
                <button
                  onClick={completeTutorial}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  Skip
                </button>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                {TUTORIAL_STEPS[tutorialStep].title}
              </h2>

              <p className="mt-3 text-base leading-relaxed text-slate-600">
                {TUTORIAL_STEPS[tutorialStep].body}
              </p>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: `${((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100}%`,
                  }}
                />
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  onClick={() =>
                    setTutorialStep((current) => Math.max(0, current - 1))
                  }
                  disabled={tutorialStep === 0}
                  className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-40"
                >
                  Back
                </button>

                {tutorialStep === TUTORIAL_STEPS.length - 1 ? (
                <button
                  onClick={completeTutorial}
                  className={compactPrimaryButtonClass}
                >
                  Finish
                </button>
                ) : (
                  <button
                    onClick={() => setTutorialStep((current) => current + 1)}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedPhoto.component}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {selectedPhoto.priorityLevel} finding
                  </p>
                </div>

                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Close
                </button>
              </div>

              <img
                src={getPhotoUrl(selectedPhoto.photo)}
                alt={selectedPhoto.photo.filename}
                className="max-h-[70vh] w-full rounded-2xl bg-slate-100 object-contain"
              />

              <p className="mt-3 break-all text-sm font-semibold text-slate-600">
                {selectedPhoto.photo.filename}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    window.open(getPhotoUrl(selectedPhoto.photo), "_blank")
                  }
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-800"
                >
                  Open
                </button>

                <button
                  onClick={() => downloadPhoto(selectedPhoto.photo)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                >
                  Download
                </button>

                <button
                  onClick={() => copyPhotoToClipboard(selectedPhoto.photo)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
                >
                  Copy Image
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
