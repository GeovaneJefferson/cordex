import os
import sys
import requests
from PyQt6.QtCore import Qt, QThread, pyqtSignal as Signal, QPoint
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QTreeView, 
    QTextEdit, QLineEdit, QPushButton, QSplitter, QFileDialog, 
    QLabel, QMenu
)
from PyQt6.QtGui import QFileSystemModel, QFont

# --- Non-Blocking Worker Thread for Ollama API ---
class OllamaWorker(QThread):
    response_received = Signal(str)
    error_occurred = Signal(str)
    
    def __init__(self, prompt, model_name="qwen2.5-coder:7b"):
        super().__init__()
        self.prompt = prompt
        self.model_name = model_name

    def run(self):
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": self.model_name,
            "prompt": self.prompt,
            "stream": False
        }
        try:
            response = requests.post(url, json=payload, timeout=90)
            if response.status_code == 200:
                self.response_received.emit(response.json().get("response", ""))
            else:
                self.error_occurred.emit(f"Server Error: {response.status_code}")
        except Exception as e:
            self.error_occurred.emit(str(e))

# --- Main High-Performance IDE Window ---
class AICodeEditor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("High-Performance AI Studio (Qt6)")
        self.resize(1280, 720)
        
        self.project_path = ""
        self.ai_target_path = ""  # Selected subfolder path
        self.project_context = "" # Loaded source code context string

        self.init_ui()

    def init_ui(self):
        mono_font = QFont("JetBrains Mono", 10)
        if not mono_font.exactMatch():
            mono_font = QFont("Courier New", 10)

        # File Menu
        open_action = self.menuBar().addMenu("&File").addAction("&Open Project")
        open_action.triggered.connect(self.open_project)

        main_splitter = QSplitter(Qt.Orientation.Horizontal)
        self.setCentralWidget(main_splitter)

        # Left Panel: Directory Tree View
        self.file_model = QFileSystemModel()
        self.file_tree = QTreeView()
        self.file_tree.setModel(self.file_model)
        self.file_tree.doubleClicked.connect(self.file_double_clicked)
        
        # Enable Right-Click Event Filter
        self.file_tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.file_tree.customContextMenuRequested.connect(self.show_tree_context_menu)
        main_splitter.addWidget(self.file_tree)

        # Center Panel: Code Workspace Panel
        center_widget = QWidget()
        center_layout = QVBoxLayout(center_widget)
        self.current_file_label = QLabel("No File Open")
        self.code_edit = QTextEdit()
        self.code_edit.setFont(mono_font)
        center_layout.addWidget(self.current_file_label)
        center_layout.addWidget(self.code_edit)
        main_splitter.addWidget(center_widget)

        # Right Panel: AI Chat Core View
        chat_widget = QWidget()
        chat_layout = QVBoxLayout(chat_widget)
        
        self.context_status_label = QLabel("Targeting: Entire Project Scope")
        self.context_status_label.setWordWrap(True)
        self.context_status_label.setStyleSheet("color: #777; font-weight: bold;")
        
        self.btn_load_context = QPushButton("⚡ Compile Targeted Context")
        self.btn_load_context.setEnabled(False)
        self.btn_load_context.clicked.connect(self.compile_selective_context)
        
        self.chat_history = QTextEdit()
        self.chat_history.setReadOnly(True)
        self.chat_history.setFont(mono_font)
        
        self.chat_input = QLineEdit()
        self.chat_input.setPlaceholderText("Ask AI to analyze targeted folder...")
        self.chat_input.returnPressed.connect(self.send_chat_message)
        
        self.btn_send = QPushButton("Send Context to Ollama")
        self.btn_send.clicked.connect(self.send_chat_message)

        chat_layout.addWidget(self.context_status_label)
        chat_layout.addWidget(self.btn_load_context)
        chat_layout.addWidget(self.chat_history)
        chat_layout.addWidget(self.chat_input)
        chat_layout.addWidget(self.btn_send)
        main_splitter.addWidget(chat_widget)

        main_splitter.setSizes([250, 550, 480])

    # --- Right-Click Context Menu Engine ---
    def show_tree_context_menu(self, position: QPoint):
        index = self.file_tree.indexAt(position)
        if not index.isValid():
            return
            
        path = self.file_model.filePath(index)
        if os.path.isdir(path):
            menu = QMenu()
            set_target_action = menu.addAction("🎯 Set as AI Target Folder")
            reset_action = menu.addAction("🔄 Reset to Full Project Scope")
            
            action = menu.exec(self.file_tree.viewport().mapToGlobal(position))
            
            if action == set_target_action:
                self.ai_target_path = path
                relative_display = os.path.relpath(path, self.project_path)
                self.context_status_label.setText(f"Targeting: /{relative_display}")
                self.context_status_label.setStyleSheet("color: #00aa00; font-weight: bold;")
            elif action == reset_action:
                self.ai_target_path = self.project_path
                self.context_status_label.setText("Targeting: Entire Project Scope")
                self.context_status_label.setStyleSheet("color: #777; font-weight: bold;")

    def open_project(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Select Project Folder")
        if dir_path:
            self.project_path = dir_path
            self.ai_target_path = dir_path
            self.file_model.setRootPath(dir_path)
            self.file_tree.setRootIndex(self.file_model.index(dir_path))
            self.btn_load_context.setEnabled(True)
            self.chat_history.append(f"<i>Project workspace established: {dir_path}</i>\n")

    def file_double_clicked(self, index):
        file_path = self.file_model.filePath(index)
        if os.path.isfile(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    self.code_edit.setPlainText(f.read())
                self.current_file_label.setText(os.path.basename(file_path))
            except Exception as e:
                self.chat_history.append(f"<b style='color:red;'>Read Error:</b> {str(e)}\n")

    # --- High Performance Selective Compilation Pipeline ---
    def compile_selective_context(self):
        scan_root = self.ai_target_path if self.ai_target_path else self.project_path
        if not scan_root:
            return

        context_blocks = []
        valid_extensions = ('.py', '.js', '.ts', '.tsx', '.json', '.html', '.css', '.gd')
        ignore_dirs = {'node_modules', '.git', '__pycache__', '.godot', 'build', '.expo'}

        for root, dirs, files in os.walk(scan_root):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                if file.endswith(valid_extensions):
                    full_path = os.path.join(root, file)
                    relative_path = os.path.relpath(full_path, self.project_path)
                    try:
                        with open(full_path, 'r', encoding='utf-8') as f:
                            # Performance Boost: Strip leading/trailing structural spacing
                            lines = [l.strip() for l in f.readlines() if l.strip()]
                            if lines:
                                context_blocks.append(f"== FILE: {relative_path} ==\n" + "\n".join(lines))
                    except Exception:
                        continue

        self.project_context = "\n\n".join(context_blocks)
        count_bytes = len(self.project_context.encode('utf-8'))
        self.chat_history.append(f"<b style='color:green;'>✓ Context packed!</b> Loaded {len(context_blocks)} source files (~{count_bytes / 1024:.1f} KB).\n")

    def send_chat_message(self):
        user_query = self.chat_input.text().strip()
        if not user_query:
            return

        self.chat_history.append(f"<b>You:</b> {user_query}")
        self.chat_input.clear()
        self.btn_send.setEnabled(False)

        full_prompt = ""
        if self.project_context:
            full_prompt += f"Targeted codebase module context:\n\n{self.project_context}\n\n"
        
        full_prompt += f"Task: {user_query}\nAnalyze the files provided above and correct bugs."

        self.worker = OllamaWorker(full_prompt, model_name="deepseek-r1:1.5b")
        self.worker.response_received.connect(self.handle_ai_response)
        self.worker.error_occurred.connect(self.handle_ai_error)
        self.worker.start()

    def handle_ai_response(self, response):
        self.chat_history.append(f"\n<b>AI Assistant:</b>\n{response}\n<hr>")
        self.btn_send.setEnabled(True)

    def handle_ai_error(self, error_msg):
        self.chat_history.append(f"\n<b style='color:red;'>Ollama Error:</b> {error_msg}\n")
        self.btn_send.setEnabled(True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AICodeEditor()
    window.show()
    sys.exit(app.exec())