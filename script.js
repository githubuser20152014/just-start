let userId = localStorage.getItem('userId');
if (!userId) {
    // Generate a new UUID if none exists
    userId = crypto.randomUUID();
    localStorage.setItem('userId', userId);
}

let todos = {
    today: [],
    tomorrow: [],
    later: []
};

let projects = {};  // Store projects and their tasks

let editingId = null;  // Track which task is being edited

let notes = [];  // Store notes with timestamps

let editingNoteId = null;  // Track which note is being edited

let insights = {};  // Store daily insights

function extractProjectFromText(text) {
    const projectMatch = text.match(/#(\w+)/);
    const dateMatch = text.match(/@(\w+)/);
    
    let cleanText = text;
    let project = null;
    let dueDate = 'today'; // default due date
    
    if (projectMatch) {
        project = projectMatch[1];
        cleanText = cleanText.replace(/#\w+/, '');
    }
    
    if (dateMatch) {
        const dateTerm = dateMatch[1].toLowerCase();
        if (dateTerm === 'tomorrow') {
            dueDate = 'tomorrow';
        } else if (dateTerm === 'later') {
            dueDate = 'later';
        }
        cleanText = cleanText.replace(/@\w+/, '');
    }
    
    return {
        project,
        text: cleanText.trim(),
        dueDate
    };
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    
    if (text) {
        const { project, text: taskText, dueDate } = extractProjectFromText(text);
        
        const todo = {
            id: Date.now(),
            text: taskText,
            completed: false,
            date: new Date().toISOString().split('T')[0],
            project: project
        };
        
        // Add to appropriate time-based list
        todos[dueDate].push(todo);
        
        if (project) {
            if (!projects[project]) {
                projects[project] = [];
            }
            projects[project].push(todo);
        }
        
        renderTodos();
        renderProjects();
        saveTodos();
        input.value = '';
    }
}

function toggleTodo(list, id) {
    const todo = todos[list].find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        
        // Sync with project if task belongs to one
        if (todo.project && projects[todo.project]) {
            const projectTodo = projects[todo.project].find(t => t.id === id);
            if (projectTodo) {
                projectTodo.completed = todo.completed;
            }
        }
        
        renderTodos();
        renderProjects();
        saveTodos();
    }
}

function deleteTodo(list, id) {
    const todoToDelete = todos[list].find(todo => todo.id === id);
    if (!todoToDelete) return;

    if (todoToDelete.date === new Date().toISOString().split('T')[0] && !todoToDelete.isSubtask) {
        // If it's a today's task, also delete its subtasks
        todos[list] = todos[list].filter(todo => todo.id !== id && todo.parentId !== id);
    } else {
        // For other dates or subtasks, just delete the task
        todos[list] = todos[list].filter(todo => todo.id !== id);
    }
    renderTodos();
}

// Add this helper function to sort tasks
function sortTasksByCompletion(tasks) {
    return [...tasks].sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    });
}

function renderTodos() {
    ['today', 'tomorrow', 'later'].forEach(list => {
        const listElement = document.getElementById(`${list}-list`);
        listElement.innerHTML = '';
        
        // Sort tasks - completed ones go to bottom
        const sortedTodos = sortTasksByCompletion(todos[list]);
        
        sortedTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = 'todo-item';
            li.draggable = true;
            if (todo.completed) li.classList.add('completed');
            
            if (editingId === todo.id) {
                // Render edit input
                li.innerHTML = `
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                        onchange="toggleTodo('${list}', ${todo.id})">
                    <input type="text" 
                        class="edit-input" 
                        value="${todo.text}${todo.project ? ` #${todo.project}` : ''}"
                        onkeydown="if(event.key === 'Enter') saveEdit('${list}', ${todo.id}, this.value)"
                        onblur="saveEdit('${list}', ${todo.id}, this.value)">
                    ${todo.date ? `<span class="date">${todo.date}</span>` : ''}
                    <button class="delete-btn" onclick="deleteTodo('${list}', ${todo.id})">×</button>
                `;
                
                // Focus the input after rendering
        setTimeout(() => {
                    const input = li.querySelector('.edit-input');
                input.focus();
                input.select();
                }, 0);
            } else {
                // Render normal view with project tag
                li.innerHTML = `
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                        onchange="toggleTodo('${list}', ${todo.id})">
                    <span class="task-text" ondblclick="startEditing('${list}', ${todo.id})">${todo.text}</span>
                    ${todo.project ? `<span class="project-tag">#${todo.project}</span>` : ''}
                    ${todo.date ? `<span class="date">${todo.date}</span>` : ''}
                    <button class="delete-btn" onclick="deleteTodo('${list}', ${todo.id})">×</button>
                `;
            }
            
            li.addEventListener('dragstart', e => handleDragStart(e, list, todo.id));
            li.addEventListener('dragend', handleDragEnd);
            
            listElement.appendChild(li);
        });
    });
}

function renderProjects() {
    const projectsContainer = document.getElementById('projects-container');
    projectsContainer.innerHTML = '';
    
    // Keep track of project order
    if (!localStorage.getItem('projectOrder')) {
        const projectOrder = Object.keys(projects);
        localStorage.setItem('projectOrder', JSON.stringify(projectOrder));
    }
    
    const projectOrder = JSON.parse(localStorage.getItem('projectOrder'));
    // Add any new projects that aren't in the order
    Object.keys(projects).forEach(project => {
        if (!projectOrder.includes(project)) {
            projectOrder.push(project);
        }
    });
    // Remove any projects that no longer exist
    const filteredOrder = projectOrder.filter(project => projects[project]);
    localStorage.setItem('projectOrder', JSON.stringify(filteredOrder));
    
    filteredOrder.forEach(projectName => {
        const projectTodos = projects[projectName];
        if (!projectTodos || projectTodos.length === 0) return;
        
        const projectSection = document.createElement('div');
        projectSection.className = 'project-section';
        projectSection.draggable = true;
        
        // Add drag handlers to project section
        projectSection.addEventListener('dragstart', e => handleProjectSectionDragStart(e, projectName));
        projectSection.addEventListener('dragend', handleProjectSectionDragEnd);
        
        const projectHeader = document.createElement('div');
        projectHeader.className = 'project-header';
        projectHeader.innerHTML = `
            <h2 class="project-title">
                <span class="project-tag">#${projectName}</span>
                ${projectName}
            </h2>
            <button class="delete-project-btn" onclick="deleteProject('${projectName}')">×</button>
        `;

        // Add project input section
        const projectInput = document.createElement('div');
        projectInput.className = 'project-input';
        projectInput.innerHTML = `
            <input type="text" 
                class="project-task-input" 
                placeholder="Add a task to #${projectName}..."
                onkeypress="if(event.key === 'Enter') addProjectTodo('${projectName}', this.value)">
        `;
        
        const todosList = document.createElement('ul');
        todosList.className = 'todo-list';
        todosList.id = `project-${projectName}-list`;
        
        // Sort project tasks - completed ones go to bottom
        const sortedProjectTodos = sortTasksByCompletion(projectTodos);
        
        sortedProjectTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.draggable = true;  // Make draggable
            li.innerHTML = `
                <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                    onchange="toggleProjectTodo('${projectName}', ${todo.id})">
                <span class="task-text">${todo.text}</span>
                ${todo.date ? `<span class="date">${todo.date}</span>` : ''}
                <button class="delete-btn" onclick="deleteProjectTodo('${projectName}', ${todo.id})">×</button>
            `;
            
            // Add drag handlers
            li.addEventListener('dragstart', e => handleProjectDragStart(e, projectName, todo.id));
            li.addEventListener('dragend', handleDragEnd);
            
            todosList.appendChild(li);
        });
        
        // Add dragover handler to the list
        todosList.addEventListener('dragover', e => {
            e.preventDefault();
            handleProjectDragOver(e, projectName);
        });
        
        projectSection.appendChild(projectHeader);
        projectSection.appendChild(projectInput);  // Add input section
        projectSection.appendChild(todosList);
        projectsContainer.appendChild(projectSection);
    });
    
    // Add drag and drop handlers to container
    projectsContainer.addEventListener('dragover', handleProjectSectionDragOver);
    projectsContainer.addEventListener('drop', handleProjectSectionDrop);
}

function toggleProjectTodo(projectName, id) {
    const todo = projects[projectName].find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        
        // Sync with all time-based lists
        ['today', 'tomorrow', 'later'].forEach(list => {
            const timeBasedTodo = todos[list].find(t => t.id === id);
            if (timeBasedTodo) {
                timeBasedTodo.completed = todo.completed;
            }
        });
        
        renderTodos();
        renderProjects();
        saveTodos();
    }
}

function deleteProjectTodo(projectName, id) {
    // Remove from project
    projects[projectName] = projects[projectName].filter(t => t.id !== id);
    
    // Remove from all time-based lists
    ['today', 'tomorrow', 'later'].forEach(list => {
        todos[list] = todos[list].filter(t => t.id !== id);
    });
    
    renderTodos();
    renderProjects();
    saveTodos();
}

// Drag and Drop functionality
function handleDragStart(e, sourceList, todoId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ sourceList, todoId }));
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Add this function back for time window drag and drop
function handleDragOver(e, list) {
    e.preventDefault();
    const draggingElement = document.querySelector('.dragging');
    const listElement = document.getElementById(`${list}-list`);
    const siblings = [...listElement.querySelectorAll('.todo-item:not(.dragging)')];
    
    // Get the dragged task's completion status
    const draggedTaskId = parseInt(draggingElement.querySelector('input[type="checkbox"]').getAttribute('onchange').match(/\d+/)[0]);
    const draggedTask = todos[list].find(t => t.id === draggedTaskId);
    const isDraggedCompleted = draggedTask ? draggedTask.completed : false;
    
    // Find appropriate position based on completion status
    const nextSibling = siblings.find(sibling => {
        const siblingId = parseInt(sibling.querySelector('input[type="checkbox"]').getAttribute('onchange').match(/\d+/)[0]);
        const siblingTask = todos[list].find(t => t.id === siblingId);
        const isSiblingCompleted = siblingTask ? siblingTask.completed : false;
        
        if (isDraggedCompleted && !isSiblingCompleted) return false;
        if (!isDraggedCompleted && isSiblingCompleted) return true;
        
        const rect = sibling.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;
        return e.clientY < midPoint;
    });
    
    if (nextSibling) {
        listElement.insertBefore(draggingElement, nextSibling);
    } else {
        listElement.appendChild(draggingElement);
    }
}

// Modify the column event listeners
['today', 'tomorrow', 'later'].forEach(list => {
    const column = document.getElementById(`${list}-column`);
    
    column.addEventListener('dragover', e => {
            e.preventDefault();
            column.classList.add('drag-over');
        handleDragOver(e, list);
    });
    
    column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

    column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');
            
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { sourceList, todoId } = data;
        
        if (sourceList !== list) {
            // Moving between lists (existing code)
            const todoIndex = todos[sourceList].findIndex(t => t.id === todoId);
            if (todoIndex !== -1) {
                const todo = todos[sourceList][todoIndex];
                
                // Update date based on the target list
                if (list === 'today') {
                    todo.date = new Date().toISOString().split('T')[0];
                } else if (list === 'tomorrow') {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    todo.date = tomorrow.toISOString().split('T')[0];
                } else if (list === 'later') {
                    todo.date = null;
                }
                
                // Update the date in the projects list if the task belongs to a project
                if (todo.project && projects[todo.project]) {
                    const projectTodo = projects[todo.project].find(t => t.id === todoId);
                    if (projectTodo) {
                        projectTodo.date = todo.date;
                    }
                }
                
                todos[sourceList].splice(todoIndex, 1);
                todos[list].push(todo);
            }
        } else {
            // Reordering within the same list
            const listElement = document.getElementById(`${list}-list`);
            const items = [...listElement.querySelectorAll('.todo-item')];
            const newOrder = items.map(item => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                const todoId = checkbox.getAttribute('onchange').match(/\d+/)[0];
                return parseInt(todoId);
            });
            
            // Reorder the todos array based on the new DOM order
            const reorderedTodos = newOrder.map(id => 
                todos[list].find(todo => todo.id === id)
            ).filter(Boolean);
            
            todos[list] = reorderedTodos;
        }
        
        renderTodos();
        renderProjects();
                    saveTodos();
    });
});

// Add event listener for Enter key
document.getElementById('todoInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addTodo();
    }
}); 

// Add these functions at the top after todos declaration
function saveTodos() {
    const data = {
        todos: todos,
        projects: projects,
        notes: notes,
        insights: insights,
        lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem('justStartData', JSON.stringify(data));
}

// Add this function to fix data inconsistencies
function syncProjectsWithTimeWindows() {
    // Get all project tasks
    const allProjectTasks = new Set();
    Object.values(projects).forEach(projectTasks => {
        projectTasks.forEach(task => {
            allProjectTasks.add(task.id);
            
            // Ensure task is in the correct time window
            let found = false;
            ['today', 'tomorrow', 'later'].forEach(list => {
                if (todos[list].some(t => t.id === task.id)) {
                    found = true;
                }
            });
            
            // If task isn't in any time window, add it to today
            if (!found) {
                todos.today.push(task);
            }
        });
    });
    
    // Clean up any orphaned tasks in time windows
    ['today', 'tomorrow', 'later'].forEach(list => {
        todos[list] = todos[list].filter(task => {
            if (task.project) {
                return allProjectTasks.has(task.id);
            }
            return true;
        });
    });
}

// Call this function when loading data and after major changes
function loadTodos() {
    // First try to load from localStorage
    const savedData = localStorage.getItem('justStartData');
    console.log('Loading from localStorage:', savedData); // Debug log
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            todos = data.todos || {
                today: [],
                tomorrow: [],
                later: []
            };
            projects = data.projects || {};
            notes = data.notes || [];
            insights = data.insights || {};
            
            // Update UI
            syncProjectsWithTimeWindows();
            renderTodos();
            renderProjects();
            renderNotes();
            renderInsights();
        } catch (error) {
            console.error('Error parsing localStorage data:', error);
            // Initialize empty data structures if parsing fails
            todos = { today: [], tomorrow: [], later: [] };
            projects = {};
            notes = [];
            insights = {};
        }
    }
}

// Call loadTodos when the page loads
document.addEventListener('DOMContentLoaded', loadTodos);

// Add this function to handle editing
function startEditing(list, id) {
    editingId = id;
    renderTodos();
}

function saveEdit(list, id, newText) {
    const todo = todos[list].find(t => t.id === id);
    if (todo) {
        // Extract project from edited text
        const { project, text: taskText } = extractProjectFromText(newText);
        
        // Remove from old project if it existed
        if (todo.project && projects[todo.project]) {
            projects[todo.project] = projects[todo.project].filter(t => t.id !== id);
        }
        
        // Update task text and project
        todo.text = taskText;
        todo.project = project;
        
        // Add to new project if specified
        if (project) {
            if (!projects[project]) {
                projects[project] = [];
            }
            projects[project].push(todo);
        }
        
        editingId = null;
        renderTodos();
        renderProjects();
            saveTodos();
    }
}

// Add this function to handle project suggestions
function showProjectSuggestions(input) {
    const cursorPosition = input.selectionStart;
    const text = input.value;
    const hashtagIndex = text.lastIndexOf('#', cursorPosition);
    
    if (hashtagIndex !== -1) {
        const partial = text.slice(hashtagIndex + 1, cursorPosition).toLowerCase();
        if (partial.length > 0) {
            const suggestions = Object.keys(projects).filter(project => 
                project.toLowerCase().startsWith(partial)
            );
            
            if (suggestions.length > 0) {
                renderSuggestions(suggestions, input, hashtagIndex);
            } else {
                hideSuggestions();
            }
        } else {
            hideSuggestions();
        }
    } else {
        hideSuggestions();
    }
}

function renderSuggestions(suggestions, input, hashtagIndex) {
    let suggestionBox = document.getElementById('project-suggestions');
    if (!suggestionBox) {
        suggestionBox = document.createElement('div');
        suggestionBox.id = 'project-suggestions';
        input.parentNode.appendChild(suggestionBox);
    }
    
    const inputRect = input.getBoundingClientRect();
    const textWidth = getTextWidth(input.value.slice(0, hashtagIndex + 1), input);
    
    // Update positioning to appear below the input
    suggestionBox.style.position = 'absolute';
    suggestionBox.style.left = `${inputRect.left + textWidth}px`;
    suggestionBox.style.top = `${inputRect.bottom + 2}px`;  // Position just below input
    suggestionBox.style.minWidth = '150px';  // Ensure minimum width for suggestions
    
    suggestionBox.innerHTML = suggestions.map(project => `
        <div class="suggestion-item" onclick="selectProject('${project}', ${hashtagIndex})">
            #${project}
        </div>
    `).join('');
}

function getTextWidth(text, input) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    const computedStyle = window.getComputedStyle(input);
    context.font = computedStyle.font;
    return context.measureText(text).width;
}

function hideSuggestions() {
    const suggestionBox = document.getElementById('project-suggestions');
    if (suggestionBox) {
        suggestionBox.remove();
    }
}

function selectProject(project, hashtagIndex) {
    const input = document.getElementById('todoInput');
    const text = input.value;
    const beforeHash = text.slice(0, hashtagIndex);
    const afterPartial = text.slice(input.selectionStart);
    
    input.value = `${beforeHash}#${project}${afterPartial}`;
    input.focus();
    hideSuggestions();
}

// Modify the input event listeners
document.getElementById('todoInput').addEventListener('input', function(e) {
    showProjectSuggestions(this);
});

document.getElementById('todoInput').addEventListener('blur', function(e) {
    // Small delay to allow clicking on suggestions
    setTimeout(hideSuggestions, 200);
});

// Add new functions for project drag and drop
function handleProjectDragStart(e, projectName, todoId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ projectName, todoId }));
    e.target.classList.add('dragging');
}

function handleProjectDragOver(e, projectName) {
        e.preventDefault();
        const draggingElement = document.querySelector('.dragging');
    const listElement = document.getElementById(`project-${projectName}-list`);
    const siblings = [...listElement.querySelectorAll('.todo-item:not(.dragging)')];
    
    // Get the dragged task's completion status
    const draggedTaskId = parseInt(draggingElement.querySelector('input[type="checkbox"]').getAttribute('onchange').match(/\d+/)[0]);
    const draggedTask = projects[projectName].find(t => t.id === draggedTaskId);
    const isDraggedCompleted = draggedTask ? draggedTask.completed : false;
    
    // Find appropriate position based on completion status
        const nextSibling = siblings.find(sibling => {
        const siblingId = parseInt(sibling.querySelector('input[type="checkbox"]').getAttribute('onchange').match(/\d+/)[0]);
        const siblingTask = projects[projectName].find(t => t.id === siblingId);
        const isSiblingCompleted = siblingTask ? siblingTask.completed : false;
        
        if (isDraggedCompleted && !isSiblingCompleted) return false;
        if (!isDraggedCompleted && isSiblingCompleted) return true;
        
            const rect = sibling.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;
        return e.clientY < midPoint;
        });

        if (nextSibling) {
        listElement.insertBefore(draggingElement, nextSibling);
        } else {
        listElement.appendChild(draggingElement);
    }
    
    // Update the projects array order
    const items = [...listElement.querySelectorAll('.todo-item')];
    const newOrder = items.map(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const todoId = checkbox.getAttribute('onchange').match(/\d+/)[0];
        return parseInt(todoId);
    });
    
    // Reorder the projects array based on the new DOM order
    const reorderedTodos = newOrder.map(id => 
        projects[projectName].find(todo => todo.id === id)
    ).filter(Boolean);
    
    projects[projectName] = reorderedTodos;
    saveTodos();
}

// Modify the addProjectTodo function to handle due dates
function addProjectTodo(projectName, text) {
    if (!text.trim()) return;
    
    // Check for due date in the text
    const { text: taskText, dueDate } = extractProjectFromText(text);
    
    const todo = {
        id: Date.now(),
        text: taskText,
        completed: false,
        date: new Date().toISOString().split('T')[0],
        project: projectName
    };
    
    // Add to project
    if (!projects[projectName]) {
        projects[projectName] = [];
    }
    projects[projectName].push(todo);
    
    // Add to appropriate time-based list
    todos[dueDate].push(todo);
    
    // Clear the input
    const input = document.querySelector(`#project-${projectName}-list`).previousElementSibling.querySelector('input');
    if (input) {
        input.value = '';
    }
    
    renderTodos();
    renderProjects();
    saveTodos();
}

// Add new function to handle project deletion
function deleteProject(projectName) {
    if (confirm(`Are you sure you want to delete project #${projectName} and all its tasks?`)) {
        // Get all task IDs from this project
        const projectTaskIds = projects[projectName].map(task => task.id);
        
        // Remove tasks from all time-based lists
        ['today', 'tomorrow', 'later'].forEach(list => {
            todos[list] = todos[list].filter(task => !projectTaskIds.includes(task.id));
        });
        
        // Delete the project
        delete projects[projectName];
        
        renderTodos();
        renderProjects();
        saveTodos();
    }
}

// Add new functions for project section drag and drop
function handleProjectSectionDragStart(e, projectName) {
    e.dataTransfer.setData('text/plain', projectName);
    e.target.classList.add('project-dragging');
}

function handleProjectSectionDragEnd(e) {
    e.target.classList.remove('project-dragging');
}

function handleProjectSectionDragOver(e) {
    e.preventDefault();
    const draggingElement = document.querySelector('.project-dragging');
    if (!draggingElement) return;
    
    const container = document.getElementById('projects-container');
    const siblings = [...container.querySelectorAll('.project-section:not(.project-dragging)')];
    
    const nextSibling = siblings.find(sibling => {
        const rect = sibling.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;
        return e.clientY < midPoint;
    });
    
    if (nextSibling) {
        container.insertBefore(draggingElement, nextSibling);
    } else {
        container.appendChild(draggingElement);
    }
}

function handleProjectSectionDrop(e) {
    e.preventDefault();
    const projectName = e.dataTransfer.getData('text/plain');
    const container = document.getElementById('projects-container');
    const projectSections = [...container.querySelectorAll('.project-section')];
    
    // Update project order
    const newOrder = projectSections.map(section => {
        const projectTag = section.querySelector('.project-tag');
        return projectTag.textContent.substring(1); // Remove # from tag
    });
    
    localStorage.setItem('projectOrder', JSON.stringify(newOrder));
    renderProjects();
    saveTodos();
}

// Add this function to handle adding notes
function addNote() {
    const input = document.getElementById('noteInput');
    const text = input.value.trim();
    
    if (text) {
        const note = {
            id: Date.now(),
            text: text,
            timestamp: new Date().toLocaleString()
        };
        
        notes.push(note);
        input.value = '';
        renderNotes();
        saveTodos();  // Modify saveTodos to include notes
    }
}

// Add this function to render notes
function renderNotes() {
    const notesContainer = document.getElementById('notes-container');
    if (!notesContainer) return;
    
    const notesList = notesContainer.querySelector('.notes-list');
    notesList.innerHTML = '';
    
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = 'note-item';
        
        if (editingNoteId === note.id) {
            // Render edit input
            li.innerHTML = `
                <div class="note-content">
                    <input type="text" 
                        class="note-edit-input" 
                        value="${note.text}"
                        onkeydown="if(event.key === 'Enter') saveNoteEdit(${note.id}, this.value)"
                        onblur="saveNoteEdit(${note.id}, this.value)">
                    <span class="note-timestamp">${note.timestamp}</span>
                </div>
                <button class="delete-btn" onclick="deleteNote(${note.id})">×</button>
            `;
            
            // Focus the input after rendering
            setTimeout(() => {
                const input = li.querySelector('.note-edit-input');
                input.focus();
                input.select();
            }, 0);
        } else {
            // Render normal view
            li.innerHTML = `
                <div class="note-content">
                    <span class="note-text" ondblclick="startNoteEditing(${note.id})">${note.text}</span>
                    <span class="note-timestamp">${note.timestamp}</span>
                </div>
                <button class="delete-btn" onclick="deleteNote(${note.id})">×</button>
            `;
        }
        
        notesList.appendChild(li);
    });
}

// Add functions to handle note editing
function startNoteEditing(id) {
    editingNoteId = id;
    renderNotes();
}

function saveNoteEdit(id, newText) {
    const note = notes.find(n => n.id === id);
    if (note && newText.trim()) {
        note.text = newText.trim();
        note.timestamp = new Date().toLocaleString() + ' (edited)';
        editingNoteId = null;
        renderNotes();
        saveTodos();
    }
}

// Add function to delete notes
function deleteNote(id) {
    notes = notes.filter(note => note.id !== id);
    renderNotes();
                    saveTodos();
}

// Update the input placeholder to show the new @ syntax
document.getElementById('todoInput').placeholder = 'Add a new task... Use #project for project and @tomorrow or @later for due date'; 

// Add this function to generate daily summary
function generateDailySummary() {
    // Get today's date in EST
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
        .toISOString().split('T')[0];
    
    const completedToday = todos.today.filter(task => task.completed);
    
    // Group tasks by project
    const projectMetrics = {};
    todos.today.forEach(task => {
        const projectName = task.project || 'General';
        if (!projectMetrics[projectName]) {
            projectMetrics[projectName] = {
                total: 0,
                completed: 0
            };
        }
        projectMetrics[projectName].total++;
        if (task.completed) {
            projectMetrics[projectName].completed++;
        }
    });

    // Generate concise summary
    let daySummary = '';
    
    if (Object.keys(projectMetrics).length > 0) {
        Object.entries(projectMetrics).forEach(([project, metrics]) => {
            if (project !== 'General') {
                daySummary += `\n🎯 #${project}: ${metrics.completed}/${metrics.total} tasks completed`;
            }
        });

        // Add general tasks last
        if (projectMetrics['General']) {
            const general = projectMetrics['General'];
            if (general.total > 0) {
                daySummary += `\n✨ Other tasks: ${general.completed}/${general.total} completed`;
            }
        }
    } else {
        daySummary = "No tasks were planned for today.";
    }

    // Calculate overall completion rate
    const completionRate = todos.today.length > 0 
        ? Math.round((completedToday.length / todos.today.length) * 100) 
        : 0;
    
    // Generate motivational message based on progress
    let motivationalMessage = '';
    if (completionRate >= 80) {
        motivationalMessage = "You're absolutely crushing it! Today's achievements show what you're capable of. Keep this momentum going! 🔥";
    } else if (completionRate >= 50) {
        motivationalMessage = "Solid progress today! You're building momentum and moving steadily toward your goals. Tomorrow brings new opportunities! 💪";
    } else if (completionRate > 0) {
        motivationalMessage = "Every step forward counts! You're making progress, and that's what matters. Let's build on today's achievements! ⭐";
    } else {
        motivationalMessage = "Today may have had its challenges, but tomorrow is a fresh start. Remember: progress isn't always visible, but every day brings us closer to our goals! 🌟";
    }

    // Get the first uncompleted task for tomorrow
    const tomorrowsFocus = todos.tomorrow.find(task => !task.completed);

    // Store the daily insight
    insights[today] = {
        summary: daySummary,
        completionRate: completionRate,
        motivationalMessage: motivationalMessage,
        tomorrowsFocus: tomorrowsFocus ? tomorrowsFocus.text : null,
        timestamp: new Date().toLocaleString()
    };

    // Save and render
    saveTodos();
    renderInsights();
}

// Add function to render insights
function renderInsights() {
    const insightsContent = document.getElementById('insights-content');
    
    // Get last 7 days
    const dates = Object.keys(insights)
        .sort()
        .reverse()
        .slice(0, 7);
    
    if (dates.length === 0) {
        insightsContent.innerHTML = `
            <div class="summary-section">
                <p class="no-insights">No insights generated yet. Complete some tasks and generate a daily summary!</p>
            </div>
        `;
        return;
    }

    const summaryHTML = dates.map(date => {
        const insight = insights[date];
        // Create date object with timezone consideration
        const dateObj = new Date(date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/New_York'  // Set to EST
        });
        
        return `
            <div class="insight-card ${date === new Date().toISOString().split('T')[0] ? 'today' : ''}">
                <div class="insight-header">
                    <h3>${formattedDate}</h3>
                    <span class="insight-timestamp">${insight.timestamp}</span>
                </div>
                <div class="insight-content">
                    <div class="summary-section">
                        <h4>Day in Review</h4>
                        <p class="summary-narrative">${insight.summary}</p>
                    </div>
                    
                    <div class="summary-section">
                        <h4>Progress</h4>
                        <p>Completion rate: <span class="highlight-text">${insight.completionRate}%</span></p>
                    </div>
                    
                    <div class="summary-section">
                        <p class="reflection-text">${insight.motivationalMessage}</p>
                        ${insight.tomorrowsFocus ? `
                            <p class="tomorrow-preview">
                                Next day's focus: 
                                <span class="highlight-text">${insight.tomorrowsFocus}</span>
                            </p>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    insightsContent.innerHTML = summaryHTML;
    insightsContent.classList.add('active');
}

// Add this right after initializing Firebase
db.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) {
        console.log('Connected to Firebase');
    } else {
        console.log('Not connected to Firebase');
    }
});

// Add this function to handle searching
function searchTasks(query) {
    const searchCount = document.getElementById('searchCount');
    if (!query.trim()) {
        // Reset all highlights and show all tasks
        renderTodos();
        renderProjects();
        searchCount.textContent = '';
        return;
    }

    let totalMatches = 0;
    const searchRegex = new RegExp(query, 'gi');

    // Search in time-based lists
    ['today', 'tomorrow', 'later'].forEach(list => {
        const listElement = document.getElementById(`${list}-list`);
        listElement.innerHTML = '';
        
        todos[list].forEach(todo => {
            if (todo.text.toLowerCase().includes(query.toLowerCase()) ||
                (todo.project && todo.project.toLowerCase().includes(query.toLowerCase()))) {
                totalMatches++;
                
                const li = document.createElement('li');
                li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
                
                // Highlight matching text
                const highlightedText = todo.text.replace(searchRegex, match => 
                    `<span class="task-highlight">${match}</span>`);
                
                li.innerHTML = `
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                        onchange="toggleTodo('${list}', ${todo.id})">
                    <span class="task-text">${highlightedText}</span>
                    ${todo.project ? `<span class="project-tag">#${todo.project}</span>` : ''}
                    ${todo.date ? `<span class="date">${todo.date}</span>` : ''}
                    <button class="delete-btn" onclick="deleteTodo('${list}', ${todo.id})">×</button>
                `;
                
                listElement.appendChild(li);
            }
        });
    });

    // Search in projects
    const projectsContainer = document.getElementById('projects-container');
    projectsContainer.innerHTML = '';
    
    Object.entries(projects).forEach(([projectName, projectTodos]) => {
        const matchingTodos = projectTodos.filter(todo => 
            todo.text.toLowerCase().includes(query.toLowerCase()));
        
        if (matchingTodos.length > 0) {
            totalMatches += matchingTodos.length;
            
            const projectSection = document.createElement('div');
            projectSection.className = 'project-section';
            
            projectSection.innerHTML = `
                <div class="project-header">
                    <h2 class="project-title">
                        <span class="project-tag">#${projectName}</span>
                        ${projectName}
                    </h2>
                </div>
            `;
            
            const todosList = document.createElement('ul');
            todosList.className = 'todo-list';
            
            matchingTodos.forEach(todo => {
                const highlightedText = todo.text.replace(searchRegex, match => 
                    `<span class="task-highlight">${match}</span>`);
                
                const li = document.createElement('li');
                li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
                li.innerHTML = `
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                        onchange="toggleProjectTodo('${projectName}', ${todo.id})">
                    <span class="task-text">${highlightedText}</span>
                    ${todo.date ? `<span class="date">${todo.date}</span>` : ''}
                    <button class="delete-btn" onclick="deleteProjectTodo('${projectName}', ${todo.id})">×</button>
                `;
                
                todosList.appendChild(li);
            });
            
            projectSection.appendChild(todosList);
            projectsContainer.appendChild(projectSection);
        }
    });

    // Update search count
    searchCount.textContent = `${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'}`;
} 