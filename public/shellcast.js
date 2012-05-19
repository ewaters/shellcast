var Shellcast = function (params) {
	var self = this;

	// Parameter validation and defaults
	if (params === undefined)
		params = {};
	if (params.url === undefined)
		throw "Shellcast requires you pass a url";
	if (params.element === undefined)
		throw "Shellcast requires you pass an element";
	if (params.terminal_character_width === undefined)
		params.terminal_character_width = 8; // Menlo 0.8em or 0.9em
	if (params.autoplay === undefined)
		params.autoplay = true;

	self.params = params;
	self.element = params.element;

	// Fetch the URL
	$.ajax({
		url: params.url,
		dataType: 'json',
		success: function (data) {
			self.loadData(data);
		}
	});
}

Shellcast.prototype.loadData = function (data) {
	var self = this;
	self.data = data;

	self.element.toggleClass('shellcast', true);

	// Create the terminal
	var term = new Terminal(
		data.term_cols,
		data.term_rows
	);

	// Create Terminal DOM, attach it to the element and set its width
	var terminal = $( term.open() );
	self.terminalWrapper = $('<div class="terminal-wrapper"></div>').append(terminal);
	self.element.append(self.terminalWrapper);
	terminal.width( self.params.terminal_character_width * data.term_cols );

	var captureMouseEvents = $('<div class="capture-mouse-events"></div>');
	self.terminalWrapper.append(captureMouseEvents);
	captureMouseEvents.hover(
		$.proxy( self.hoverIn, self ),
		$.proxy( self.hoverOut, self )
	);
	captureMouseEvents.click( $.proxy( self.click, self ) );

	// Create a place to display input
	var inputDisplay = $('<div class="input-display"></div>');
	self.element.append(inputDisplay);
	inputDisplay.width( self.params.terminal_character_width * data.term_cols );

	// Create a new player, give it the term and hit play
	self.player = new Shellcast.Player(term, inputDisplay);
	self.player.load(data);

	self.player.onStateChange = $.proxy( self.updateHover, self );

	if (self.params.autoplay)
		self.player.play();
}

Shellcast.prototype.hoverIn = function () {
	var self = this;
	if (self.hoverDiv !== undefined)
		return;

	self.hoverDiv = $('<div class="action-cover"></div>');
	self.updateHover( self.player.state );
	self.terminalWrapper.prepend( self.hoverDiv );

	self.hoverDiv.css('top',
		(
		 	self.terminalWrapper.height() / 2 -
			self.hoverDiv.height() / 2
		) + 'px'
	);
}

Shellcast.prototype.hoverOut = function () {
	this.hoverDiv.remove();
	this.hoverDiv = undefined;
}

Shellcast.prototype.click = function () {
	var self = this;
	if (self.player.playing)
		self.player.pause();
	else if (self.player.paused)
		self.player.unpause();
	else
		self.player.play();
}
Shellcast.prototype.updateHover = function (state) {
	var self = this;
	if (! self.hoverDiv)
		return;
	var action;
	if (state === 'playing')
		action = 'pause';
	else if (state === 'paused')
		action = 'unpause';
	else if (state === 'stopped')
		action = 'replay';
	else 
		action = 'play';
	self.hoverDiv.html(action);
}

Shellcast.Player = function (term, inputDiv) {
	this.term = term;
	this.state = undefined;
	this.playing = false;
	this.paused  = false;
	this.reachedLastFrame = false
	this.inputDiv = inputDiv;
	this.onStateChange = undefined;
}

Shellcast.Player.prototype.load = function (data) {
	this.data = data;
}

Shellcast.Player.prototype.play = function () {
	var player = this;

	if (player.playing)
		return;

	player.stateChange('playing');

	if (player.reachedLastFrame) {
		// Reset the terminal
		player.reachedLastFrame = false;
		player.term.reset();
	}

	player.currentFrame = -1;
	player.playNextFrame();
}

Shellcast.Player.prototype.pause = function () {
	var player = this;
	if (player.paused)
		return;
	player.stateChange('paused');
	if (player.nextFrameTimeoutHandle) {
		window.clearTimeout(player.nextFrameTimeoutHandle);
		player.nextFrameTimeoutHandler = undefined;
	}
}

Shellcast.Player.prototype.unpause = function () {
	var player = this;
	if (! player.paused)
		return;
	player.stateChange('playing');
	player.playNextFrame();
}

Shellcast.Player.prototype.reset = function () {
	var player = this;
	if (player.playing)
		player.pause;
	player.reachedLastFrame = true;
	player.play();
}

Shellcast.Player.prototype.stateChange = function (state) {
	var player = this;
	player.state = state;

	if (state === 'playing') {
		player.playing = true;
		player.paused  = false;
		player.term.startBlink();
	}
	else if (state === 'stopped') {
		player.reachedLastFrame = true;
		player.playing = false;
		player.term.stopBlink();
	}
	else if (state === 'paused') {
		player.playing = false;
		player.paused  = true;
		player.term.stopBlink();
	}

	if (player.onStateChange)
		player.onStateChange(state);
}

Shellcast.Player.prototype.playNextFrame = function () {
	var player = this;

	// Check to see if the next frame exists
	if (player.currentFrame + 1 > player.data.frames.length - 1) {
		player.stateChange('stopped');
		return;
	}

	// Fetch the next frame and ensure it's of the proper type
	player.currentFrame = player.currentFrame + 1;

	var frame = player.data.frames[ player.currentFrame ];
	if (frame === undefined) {
		console.error("Frame " + player.currentFrame + " doesn't exist");
		return;
	}
	if (! $.isArray(frame) || frame.length !== 3) {
		console.error("Frame " + player.currentFrame + " is not an array with three items", frame);
		return;
	}

	// Act upon the frame contents
	if (frame[0] === 'in') {
		player.addInputKey(frame[2]);
	}
	else if (frame[0] === 'out') {
		player.term.write(frame[2]);
	}
	else {
		console.error("Frame " + player.currentFrame + " has unsupported type", frame);
		return;
	}

	// Set timeout for the next frame.  The timer value for this frame represents the number of
	// ms until this frame was displayed, so need to look ahead for this.
	var timeout = 0;
	if (player.currentFrame < player.data.frames.length - 1)
		timeout = player.data.frames[ player.currentFrame + 1 ][1];
	player.nextFrameTimeoutHandle = window.setTimeout(
		function () { player.playNextFrame() },
		timeout
	);
}

Shellcast.Player.prototype.addInputKey = function (key) {
	var player = this;
	var kbd = $('<kbd class="light">' + key + '</kbd>');
	player.inputDiv.prepend(kbd);
	kbd.delay(1000).fadeOut(2000, 'swing');
}
