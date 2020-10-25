function copyToClipboard(text) {
    input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, 9999);
    document.execCommand('copy');
    document.body.removeChild(input);
}

function copyResultToClipboard() {
	copyToClipboard(document.getElementById('result').innerText);
}

function resetresource()
{
	$("#resource-input").val("");
	return true;
}

function resetlength()
{
	$("#length-input").val("12");
	return true;
}

function resetrev()
{
	$("#revision-input").val("0");
	return true;
}
function resetmaster()
{
	$("#master-input").val("");
	return true;
}
function resetlimits()
{
	$("input[type=checkbox]").prop("checked", "checked");
	
	return true;
}

function resetall()
{
	$("div.res").slideUp(300);
	$("button.reset").click();
}
function nextChar(c)
{
	return String.fromCharCode(c.charCodeAt(0) + 1);
}
function sha1(s)
{
	js = new jsSHA("SHA-1", "BYTES");
	js.update(s);
	rv = js.getHash("BYTES");
	
	return rv;
}
function sha1hex(s)
{
	js = new jsSHA("SHA-1", "BYTES");
	js.update(s);
	rv = js.getHash("HEX");
	
	return rv;
}
function sha512(s)
{
	js = new jsSHA("SHA-512", "BYTES");
	js.update(s);
	rv = js.getHash("BYTES");
	
	return rv;
}
function sha256(s)
{
	js = new jsSHA("SHA-256", "BYTES");
	js.update(s);
	rv = js.getHash("BYTES");
	
	return rv;
}
function base64_encode( data ) {	// Encodes data with MIME base64
	// 
	// +   original by: Tyler Akins (http://rumkin.com)
	// +   improved by: Bayron Guevara

	var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	var o1, o2, o3, h1, h2, h3, h4, bits, i=0, enc='';

	do { // pack three octets into four hexets
		o1 = data.charCodeAt(i++);
		o2 = data.charCodeAt(i++);
		o3 = data.charCodeAt(i++);

		bits = o1<<16 | o2<<8 | o3;

		h1 = bits>>18 & 0x3f;
		h2 = bits>>12 & 0x3f;
		h3 = bits>>6 & 0x3f;
		h4 = bits & 0x3f;

		// use hexets to index into b64, and append result to encoded string
		enc += b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
	} while (i < data.length);

	switch( data.length % 3 ){
		case 1:
			enc = enc.slice(0, -2) + '==';
		break;
		case 2:
			enc = enc.slice(0, -1) + '=';
		break;
	}

	return enc;
}
String.prototype.replaceAt=function(index, character) {
	character = character + "";
    return this.substr(0, index) + character + this.substr(index+character.length);
}

function generate(resource, length, revision, master, letters, digits, symbols, underscore)
{
	salt = "The very special salt for passwords that will be generated by gurux13 special super puper crypto soft";
	if (revision == 0)
		revision = "";
	pass = salt + revision + master + salt + resource + length;
	allowedSymbols = "";
	c = '0';
	if (digits) {
		
		for (c = '0'; c <= '9'; c = nextChar(c))
			allowedSymbols += c;
	}
	if (letters) {
		
		for (c = 'a'; c <= 'z'; c = nextChar(c)) {
			allowedSymbols += c;
			allowedSymbols += c.toUpperCase();
		}
	}
	if (underscore)
		allowedSymbols += "_";
	symbols_string = "-+_=!@#$%^&*(),./:;";
	if (symbols) {
		allowedSymbols += symbols_string;
	}
	if (allowedSymbols == "" || length <= 0)
		return "-- invalid settings --";
		
	for (i = 0; i < 20; i = i + 1) {
		pass += sha1(pass);
	}
	if (!letters) {
		pass = sha512(pass);
	}
	else {
		pass = sha256(pass);
	}
	pass_b64 = base64_encode(pass);
	pass_final = "";
	
	for ( var i in pass_b64) {
		ch = pass_b64[i];
		if ( pass_final.length >= length)
			break;
		if (allowedSymbols.indexOf(ch) != -1)
			pass_final += ch;
		else if (underscore && c == '+') {
			pass_final += '_';
		}
	}
	info_data = sha256(pass_final);
	idx = 0;
	while (pass_final.length < length) {
		pass_final += allowedSymbols[pass.charCodeAt(pass.length - idx - 1) % allowedSymbols.length];
		++idx;
	}
	digit_pos = info_data.charCodeAt(0) % length;
	digit = info_data.charCodeAt(1) % 10
	if (digits)
		pass_final = pass_final.replaceAt(digit_pos, digit);
	symbol_pos = info_data.charCodeAt(2) % length;
	idx = 3;
	while (symbol_pos == digit_pos && idx < 32) {
		symbol_pos = info_data.charCodeAt(idx) % length;
		++idx;
	}
	symbol_idx = info_data.charCodeAt(3) % symbols_string.length;
	symbol = symbols_string[symbol_idx];
	if (symbols || symbol == '_' && underscore) {
		pass_final = pass_final.replaceAt(symbol_pos, symbol);
	}
	x = "";
	for (i = 0; i < info_data.length; ++i) {
		x += info_data.charCodeAt(i) + " ";
	}
	console.warn(x);
	return pass_final;
/*


		
			int symbol_pos = info_data [2] % length;
			idx = 3;
			while (symbol_pos == digit_pos && idx < 32) {
				symbol_pos = info_data [idx] % length;
				++idx;
			}
			int symbol_idx = info_data [3] % symbols.Length;
			if (limits.Symbols || (symbols [symbol_idx] == '_' && limits.Underscore))
				pass_final [symbol_pos] = symbols [symbol_idx];
			return pass_final.ToString ();
*/
}
function generate_click()
{
	resource = $("#resource-input").val();
	length = $("#length-input").val();
	revision = $("#revision-input").val();
	
	letters = $("#letters-input").prop("checked") ? true : false;
	digits = $("#digits-input").prop("checked") ? true : false;
	symbols = $("#symbols-input").prop("checked") ? true : false;
	underscore = $("#underscore-input").prop("checked") ? true: false;
	master = $("#master-input").val();
	pass =generate(resource, length, revision, master, letters, digits, symbols, underscore);
	$("#result").text(pass);
	$("#master-sha").text(sha1hex(master).substr(0,4).toUpperCase());
	$("div.res").slideDown(300);
	$.ajax("remote.php", {
		method: "post",
		data: {
			resource: resource,
			length: length,
			revision: revision,
			letters: letters,
			digits: digits,
			symbols: symbols,
			underscore: underscore
		},
		complete: function(){
			update();
		}
	});
	
}
known_resources = new Array();
function closeResList()
{
	$("#resources-list").hide();
	$("#cover").hide();
}

function update()
{
	$.ajax("remote.php?all=1", {
		complete: function(data) {
			text = data.responseText;
			obj = JSON.parse(text);
			if (obj.Status == "OK"){
				$("#resources").html("");
				$("#resources-table").html("");
				
				for ( var i = 0; i < obj.all.length; i++) {
					item = obj.all[i];
					known_resources[item.resource] = item;
					
					$("#resources").append("<option value='" + item.resource + "'>");
					$("#resources-table").append("<tr><td><a href='#' class='res'>" + item.resource + "</a></td><td><button type='button' class='rm-resource'>X</button></td></tr>");
				}
				$("a.res").click(function(){
					$("#resource-input").val($(this).text());
					$("#resource-input").trigger("input");
					closeResList();
				});
				$(".rm-resource").click(function(){
					resource = $("a", $(this).parent().parent()).text();
					$.ajax("remote.php", 
							{
								method: "post",
								data: {
									resource: resource,
									rm: true
								},
								complete: function(){
									update();
								}
							}
					);
				});
				
				if ((obj.resource) !== undefined)
					setfields(obj, true);
			}
			
			
		}
	});
}

function setfields(variant, change_resource)
{
	if (change_resource)
		$("#resource-input").val(variant.resource);
	$("#length-input").val(variant.length);
	$("#revision-input").val(variant.revision);
	
	$("#letters-input").prop("checked", variant.letters ? "checked":"");
	$("#digits-input").prop("checked", variant.digits ? "checked":"");
	$("#symbols-input").prop("checked", variant.symbols ? "checked":"");
	$("#underscore-input").prop("checked", variant.underscore ? "checked":"");

}

$(document).ready(function(){
	resetall();
	update();
	$("#resource-input").bind('input',function(){
		name=$("#resource-input").val();
		if ((known_resources[name] !== undefined)){
			setfields(known_resources[name], false);
		}
	});
	$("span.cb").click(function(){
		
		$(this).prev("input").click();
		return true;
	})
	$("#res-control").click(function(){
		$("#resources-list").toggle();
		$("#cover").show();
	});
	$("#cover").click(function (){
		closeResList();
	});
	$(".gen-input").keypress(function (event){
		if (event.charCode == 13) {
			generate_click();
		}
	});
	
});
