import SwiftUI
import Combine
import Speech
import AVFoundation

/// 实时语音转写（中文），仅在问答助手内使用。
@MainActor
final class SpeechInput: ObservableObject {
    @Published var transcript = ""
    @Published var recording = false
    @Published var problem: String?

    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    /// 请求语音识别 + 麦克风权限。返回是否可用。
    func requestAccess() async -> Bool {
        let speechOK = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
        guard speechOK else {
            problem = "未获得语音识别权限，可在系统设置中开启"
            return false
        }
        let micOK = await AVAudioApplication.requestRecordPermission()
        if !micOK {
            problem = "未获得麦克风权限，可在系统设置中开启"
            return false
        }
        guard SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))?.isAvailable == true else {
            problem = "当前设备不支持中文语音识别"
            return false
        }
        return true
    }

    func start() {
        stop()
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")), recognizer.isAvailable else {
            problem = "当前设备不支持中文语音识别"
            return
        }
        problem = nil
        transcript = ""

        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        self.engine = engine
        self.request = request

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            problem = "无法获取麦克风（模拟器请直接用键盘输入）"
            return
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            engine.prepare()
            try engine.start()
        } catch {
            problem = "麦克风启动失败"
            stop()
            return
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let finished = result?.isFinal == true || error != nil
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let text { self.transcript = text }
                if finished { self.stop() }
            }
        }
        recording = true
    }

    func stop() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        request?.endAudio()
        task?.cancel()
        engine = nil
        request = nil
        task = nil
        recording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// 朗读助手回答。
@MainActor
final class Speaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published var speaking = false
    private let synth = AVSpeechSynthesizer()

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        synth.speak(utterance)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = true }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}

/// 识别结果上的「问一句」弹层。
struct AssistantSheet: View {
    var body: some View {
        NavigationStack {
            AssistantView(showsDismiss: true)
        }
    }
}

/// AI 安全管家：独立页与识别弹层共用。语音 + 打字，结合家庭画像与档案。
struct AssistantView: View {
    var showsDismiss = false
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @StateObject private var speech = SpeechInput()
    @StateObject private var speaker = Speaker()
    @State private var messages: [AskTurn] = []
    @State private var input = ""
    @State private var busy = false
    @State private var error: String?
    @State private var recentNames: [String] = []
    @State private var lastFacts: [String] = []
    @State private var lastRelated: [String] = []

    private let sampleQuestions = [
        "结合我家情况，看看这款产品能用吗",
        "对比我扫过的产品，挑更合适的一款",
        "拍不清的成分表，帮我看看要注意什么",
        "这个能放厨房吗",
        "它和洁厕灵能一起用吗",
        "厨房有什么危险",
        "卫生间有什么危险",
    ]

    var body: some View {
        VStack(spacing: 0) {
            if !showsDismiss {
                Text("语音或打字提问，结合你的家庭画像与档案回答")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 8)
            }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        greetingBubble
                        ForEach(Array(messages.enumerated()), id: \.offset) { index, turn in
                            bubble(turn, facts: index == messages.count - 1 && turn.role != "user" ? lastFacts : [], related: index == messages.count - 1 && turn.role != "user" ? lastRelated : [])
                                .id(index)
                        }
                        if busy {
                            HStack(spacing: 6) {
                                ProgressView()
                                Text("正在思考…").font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .padding(.horizontal, 4)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: messages.count) {
                    if let last = messages.indices.last {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }

            if messages.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sampleQuestions, id: \.self) { q in
                            Button(q) { send(q) }
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Theme.paper, in: Capsule())
                                .overlay(Capsule().stroke(Theme.green.opacity(0.4), lineWidth: 1))
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
                }
            }

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Theme.coral)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
            }
            if let problem = speech.problem {
                Text(problem)
                    .font(.footnote)
                    .foregroundStyle(Theme.coral)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
            }

            HStack(spacing: 10) {
                micButton
                TextField(speech.recording ? "正在聆听…" : "打字或点左侧说话…", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit { send(input) }
                Button {
                    send(input)
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Theme.muted : Theme.green)
                }
                .disabled(input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Theme.cream)
        .navigationTitle("AI 安全管家")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if showsDismiss {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { dismiss() }
                }
            }
        }
        .task { await loadRecent() }
        .onDisappear {
            speech.stop()
            speaker.stop()
        }
    }

    private var greetingBubble: some View {
        let labels = app.profile.selectedLabels
        let scanName = app.lastScan?.analysis.displayName
        var parts: [String] = ["你好，我是你的家庭安全管家。"]
        if labels.isEmpty {
            parts.append("还没设置家庭画像，点「我的」完善后我会按你家情况回答。")
        } else {
            parts.append("我记着你的画像（\(labels.joined(separator: "、"))），回答会按这个来。")
        }
        if !recentNames.isEmpty {
            parts.append("最近扫过的 \(recentNames.joined(separator: "、")) 我也还记得，随时可以问。")
        } else if let scanName {
            parts.append("刚才识别的「\(scanName)」可以接着问。")
        }
        return HStack(alignment: .top, spacing: 8) {
            Text("安")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Theme.green, in: Circle())
            Text(parts.joined())
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private func bubble(_ turn: AskTurn, facts: [String], related: [String]) -> some View {
        if turn.role == "user" {
            HStack {
                Spacer(minLength: 48)
                Text(turn.content)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.green, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        } else {
            HStack(alignment: .bottom, spacing: 6) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(turn.content)
                        .font(.subheadline)
                        .foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Theme.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Theme.ink.opacity(0.08), lineWidth: 1)
                        )
                    if !related.isEmpty {
                        Text("相关档案：\(related.joined(separator: "、"))")
                            .font(.caption2)
                            .foregroundStyle(Theme.green)
                    }
                    if !facts.isEmpty {
                        DisclosureGroup("知识图谱线索（\(facts.count)）") {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                                    Text("· \(fact)")
                                        .font(.caption2)
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                        }
                        .font(.caption.bold())
                        .foregroundStyle(Theme.ink)
                    }
                }
                Button {
                    speaker.speaking ? speaker.stop() : speaker.speak(turn.content)
                } label: {
                    Image(systemName: speaker.speaking ? "speaker.wave.2.fill" : "speaker.wave.2")
                        .foregroundStyle(Theme.green)
                }
                .padding(.bottom, 6)
                Spacer(minLength: 24)
            }
        }
    }

    private var micButton: some View {
        Button {
            if speech.recording {
                speech.stop()
            } else {
                Task {
                    guard await speech.requestAccess() else { return }
                    speaker.stop()
                    speech.start()
                }
            }
        } label: {
            Image(systemName: speech.recording ? "stop.circle.fill" : "mic.circle.fill")
                .font(.title2)
                .foregroundStyle(speech.recording ? Theme.coral : Theme.green)
        }
        .onChange(of: speech.recording) {
            // 松口/识别结束时，把转写结果填入输入框
            if !speech.recording, !speech.transcript.isEmpty {
                input = speech.transcript
                speech.transcript = ""
            }
        }
    }

    private func send(_ raw: String) {
        let question = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !busy else { return }
        input = ""
        error = nil
        let history = messages
        messages.append(AskTurn(role: "user", content: question))
        busy = true
        Task {
            defer { busy = false }
            do {
                let res = try await app.client.ask(question: question, history: history, context: app.profile.askContext)
                lastFacts = res.factLines
                lastRelated = res.relatedLines
                messages.append(AskTurn(role: "assistant", content: res.answer))
            } catch {
                self.error = "回答失败：\(error.localizedDescription)"
            }
        }
    }

    private func loadRecent() async {
        let items = (try? await app.client.householdItems()) ?? []
        recentNames = items.suffix(3).reversed().map(\.displayName)
    }
}
