import app from "./app";

var port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log(
        "  App is running at http://localhost:%d ",
        port,
    );
    console.log("  Press CTRL-C to stop\n");
});

export default server;