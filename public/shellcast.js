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

	console.info("Got data", data);

	self.element.toggleClass('shellcast', true);

	// Create the terminal
	var term = new Terminal(
		data.term_cols,
		data.term_rows
	);

	// Create Terminal DOM, attach it to the element and set its width
	var terminal = term.open();
	self.element.append(
		$('<div class="terminal-wrapper"></div>').append(terminal)
	);
	$(terminal).width( self.params.terminal_character_width * data.term_cols );

	// Create a place to display input
	var inputDisplay = $('<div class="input-display"></div>');
	self.element.append(inputDisplay);

	// Create a new player, give it the term and hit play
	self.player = new Shellcast.Player(term, inputDisplay);
	self.player.load(data);

	if (self.params.autoplay)
		self.player.play();
	else
		console.info("Data is loaded and ready to play");
}

Shellcast.Player = function (term, inputDiv) {
	this.term = term;
	this.playing = false;
	this.inputDiv = inputDiv;
}

Shellcast.Player.prototype.load = function (data) {
	this.data = data;
}

Shellcast.Player.prototype.play = function () {
	var player = this;

	if (player.playing)
		return;
	player.playing = true;

	player.currentFrame = -1;

	player.playNextFrame();
}

Shellcast.Player.prototype.playNextFrame = function () {
	var player = this;

	// Check to see if the next frame exists
	if (player.currentFrame + 1 > player.data.frames.length - 1) {
		console.info("Reached end of frames");
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
	player.inputDiv.append('<kbd class="light">' + key + '</kbd>');
}
