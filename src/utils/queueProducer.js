const amqp = require('amqplib');

let globalChannel = null;

exports.publishToQueue = async (queueName, data) => {
  try {
    if (!globalChannel) {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      globalChannel = await connection.createChannel();
      await globalChannel.assertQueue(queueName, { durable: true });
      console.log('🔗 [RabbitMQ] Connection opened and ready.');
    }

    globalChannel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), {
      persistent: true,
    });

    console.log(
      `🎫 [RabbitMQ] Ticket created in '${queueName}' for track: ${data.trackId}`
    );
  } catch (error) {
    console.error('❌ [RabbitMQ Error] Failed to publish message:', error);
  }
};
