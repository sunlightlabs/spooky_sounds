$(document).ready(function(){

    var $addWordsForm = $('form.word-list');
    var $addWordsDiv = $('div.word-list');
    var $formList = $('form.voice-list');
    var $toggleAllVoices = $('#toggle-all-voices');

    $addWordsDiv.data('count',0);

    $addWordsForm.submit(function(evt){
        evt.preventDefault();

        var word = $addWordsForm.serializeArray()[0]['value'];
        var id =  Math.random().toString(36).substring(2);

        console.log(word + " " + id);

        $addWordsDiv.children('ul').append('<li id="' + id + '"><span>' + word + '</span><button>Delete</button></li>');

        $addWordsDiv.data('count', $addWordsDiv.data('count')+1);

        $('#' + id + ' button').click(function(e){
            e.preventDefault();
            $('#' + id).detach();
            $addWordsDiv.data('count', $addWordsDiv.data('count')-1);
            socket.emit('word_removed', {data: word});
            return false;
        });

        socket.emit('word_added', {data: word});

        console.log( $addWordsDiv.data('count'));

        return false;
    });

    /**
     * SOCKET EVENTS
     */

    var socket = io.connect('ws://' + document.domain + ':' + location.port + '/spooky');

    socket.on('connection_response', function(msg) {
        if (msg['data'] == "Connected")
        {
            for (var i=0; i < msg['voices'].length; i++)
            {
                var id =  Math.random().toString(36).substring(2);
                $formList.append('<span id="' + id + '"><input checked type="checkbox" name="voices" value="' + msg['voices'][i] + '"/>' + msg['voices'][i] + '</span><br>');
                $('#' + id).on('mouseover',function(evt){
                    playCertainWord($(this).children('input').val(),$(this).children('input').val());
                });
                $('#' + id).change(function(evt){
                    if ($(this).children('input').prop('checked'))
                    {
                        socket.emit('voice_added', {data: $(this).children('input').val()});
                    }
                    else
                    {
                        socket.emit('voice_removed', {data: $(this).children('input').val()});
                    }
                });
            }

            for (var i=0; i < msg['words'].length; i++)
            {
                $('ul.others-words').append("<li>" + msg['words'][i] + "</li>");
            }
        }
    });

    socket.on('sound', function(msg) {

        $('#sound').remove();

        $('#content').append('<audio id="sound" autoplay>' +
            '<source src="data:audio/' + msg['type'] + ';base64,' + msg['data'] + '" />' +
             '</audio>');
    });

    socket.on('word_added', function(msg) {
        $('ul.others-words').append("<li>" + msg['data'] + "</li>");
    });

    /**
     * WEBCAM FUNCTIONS
     */

    var webcamError = function(e) { alert('Webcam error!', e); };
    var video = $('#webcam')[0];

    if (navigator.getUserMedia)
    {
        navigator.getUserMedia({audio: false, video: true}, function(stream) { video.src = stream; }, webcamError);
    }
    else if (navigator.webkitGetUserMedia)
    {
        navigator.webkitGetUserMedia({audio:false, video:true}, function(stream)
        {
            video.src = window.webkitURL.createObjectURL(stream);
        }, webcamError);
    }
    else
    {
        //video.src = 'video.webm'; // fallback.
    }

    var timeOut, lastImageData;
    var canvasSource = $("#canvas-source")[0];
    var canvasBlended = $("#canvas-blended")[0];
    var contextSource = canvasSource.getContext('2d');
    var contextBlended = canvasBlended.getContext('2d');
    var soundContext, bufferLoader;
    var motion_threshold = 25;
    var probability = 0.1;
    var speed = null;

    $('form.params input[name="motion_threshold"]').val(motion_threshold);
    $('form.params input[name="motion_threshold"]').change(function(evt){
       evt.preventDefault();
       try
       {
           motion_threshold = parseFloat($(this).val());
       }
       catch(e)
       {

       }
    });

    $('form.params input[name="probability"]').val(probability);
    $('form.params input[name="probability"]').change(function(evt){
        evt.preventDefault();
        try
        {
            probability = parseFloat($(this).val());
            probability = probability > 1 ? 1 : probability;
            probability = probability < 0  ? 0 : probability;
        }
        catch(e)
        {

        }
    });

    $('form.params input[name="speed"]').change(function(evt){
        evt.preventDefault();
        try
        {
            speed = parseFloat($(this).val());
            socket.emit('set_speed', {data: speed});
        }
        catch(e)
        {

        }
    });

    $toggleAllVoices.data('on',true);
    $toggleAllVoices.click(function(evt)
    {
        evt.preventDefault();
        if ($toggleAllVoices.data('on'))
        {
            $formList.children('span').children('input').prop('checked',false);
            socket.emit('clear_voices');
            $toggleAllVoices.data('on',false);
        }
        else
        {
            $formList.children('span').children('input').prop('checked',true);
            socket.emit('all_voices');
            $toggleAllVoices.data('on',true);
        }
    });

    function drawVideo() { contextSource.drawImage(video, 0, 0, video.width, video.height); }

    function fastAbs(value) { return (value ^ (value >> 31)) - (value >> 31); }

    function threshold(value) { return (value > 0x15) ? 0xFF : 0; }

    function differenceAccuracy(target, data1, data2)
    {
        if (data1.length != data2.length) { return null; }
        var i = 0;
        while (i < (data1.length * 0.25))
        {
            var average1 = (data1[4*i] + data1[4*i+1] + data1[4*i+2]) / 3;
            var average2 = (data2[4*i] + data2[4*i+1] + data2[4*i+2]) / 3;
            var diff = threshold(fastAbs(average1 - average2));
            target[4*i] = diff;
            target[4*i+1] = diff;
            target[4*i+2] = diff;
            target[4*i+3] = 0xFF;
            ++i;
        }
    }

    function blend()
    {
        var width = canvasSource.width;
        var height = canvasSource.height;
        // get webcam image data
        var sourceData = contextSource.getImageData(0, 0, width, height);
        // create an image if the previous image doesn’t exist
        if (!lastImageData) lastImageData = contextSource.getImageData(0, 0, width, height);
        // create a ImageData instance to receive the blended result
        var blendedData = contextSource.createImageData(width, height);
        // blend the 2 images
        differenceAccuracy(blendedData.data, sourceData.data, lastImageData.data);
        // draw the result in a canvas
        contextBlended.putImageData(blendedData, 0, 0);
        // store the current webcam image
        lastImageData = sourceData;
    }

    function checkAreas()
    {
        var blendedData = contextBlended.getImageData(0, 0, video.width, video.height);

        var i = 0;
        var average = 0;
        // loop over the pixels
        while (i < (blendedData.data.length / 4)) {
            // make an average between the color channel
            average += (blendedData.data[i*4] + blendedData.data[i*4+1] + blendedData.data[i*4+2]) / 3;
            ++i;
        }

        average = Math.round(average / (blendedData.data.length / 4));

        if (average > motion_threshold && Math.random() < probability )
        {
            playSpookySound(average);
        }
    }

    function playSpookySound(val) { socket.emit('motion_detected', {speed: val}); }

    function playCertainWord(word, voice) { socket.emit('say_word', {data: word, voice: voice}); }

    function update() {
        drawVideo();
        blend();
        checkAreas();
        timeOut = setTimeout(update, 1000/60);
    }

    update()

});